const crypto = require('crypto');
const { outboundUrlProblem } = require('../utils/outboundUrl');

// How Leadrat authenticates to SOMEONE ELSE's API (section 51) - shared by
// push webhooks and pull sources. Static headers alone (the old model)
// couldn't express OAuth2 tokens that expire, Basic auth, keys that must go
// in the query string, or signed requests, so APIs needing those failed.
//
//   NONE
//   BASIC          { username, password }
//   BEARER         { token }
//   API_KEY        { keyName, keyValue, keyIn: HEADER | QUERY }
//   OAUTH2         client-credentials: { tokenUrl, clientId, clientSecret, scope, audience, clientAuth: BODY | HEADER }
//   HMAC           { secret, signatureHeader, algorithm: sha256 | sha1 | sha512, encoding: hex | base64, signaturePrefix }

const AUTH_TYPES = ['NONE', 'BASIC', 'BEARER', 'API_KEY', 'OAUTH2', 'HMAC'];
const SECRET_FIELDS = ['password', 'token', 'keyValue', 'clientSecret', 'secret'];
const MASK = '••••';
const TOKEN_TIMEOUT_MS = 10000;

const str = (v, max = 2000) => (v === undefined || v === null ? '' : String(v).slice(0, max));

// Validates an auth block from a request. Secret fields sent back masked
// (exactly as the list endpoint returned them) or omitted keep the stored
// value, so editing a connection never requires re-typing its secrets.
function sanitizeAuth(input, existing = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const type = AUTH_TYPES.includes(src.type) ? src.type : 'NONE';
  const keep = (field) => {
    const value = src[field];
    if (value === undefined || (typeof value === 'string' && value.startsWith(MASK))) return existing?.[field] || '';
    return str(value);
  };

  const auth = { type };
  if (type === 'BASIC') Object.assign(auth, { username: str(src.username, 500), password: keep('password') });
  if (type === 'BEARER') Object.assign(auth, { token: keep('token') });
  if (type === 'API_KEY') {
    Object.assign(auth, {
      keyName: str(src.keyName, 200) || 'X-Api-Key',
      keyValue: keep('keyValue'),
      keyIn: src.keyIn === 'QUERY' ? 'QUERY' : 'HEADER'
    });
  }
  if (type === 'OAUTH2') {
    Object.assign(auth, {
      tokenUrl: str(src.tokenUrl, 1000),
      clientId: str(src.clientId, 500),
      clientSecret: keep('clientSecret'),
      scope: str(src.scope, 1000),
      audience: str(src.audience, 1000),
      clientAuth: src.clientAuth === 'HEADER' ? 'HEADER' : 'BODY'
    });
  }
  if (type === 'HMAC') {
    Object.assign(auth, {
      secret: keep('secret'),
      signatureHeader: str(src.signatureHeader, 200) || 'X-Signature',
      algorithm: ['sha1', 'sha256', 'sha512'].includes(src.algorithm) ? src.algorithm : 'sha256',
      encoding: src.encoding === 'base64' ? 'base64' : 'hex',
      signaturePrefix: str(src.signaturePrefix, 50)
    });
  }
  return auth;
}

async function authProblem(auth) {
  if (!auth || auth.type === 'NONE') return null;
  if (auth.type === 'BASIC' && !auth.username) return 'Basic auth needs a username';
  if (auth.type === 'BEARER' && !auth.token) return 'Bearer auth needs a token';
  if (auth.type === 'API_KEY' && !auth.keyValue) return 'API key auth needs the key value';
  if (auth.type === 'HMAC' && !auth.secret) return 'HMAC signing needs a secret';
  if (auth.type === 'OAUTH2') {
    if (!auth.tokenUrl || !auth.clientId || !auth.clientSecret) return 'OAuth2 needs a token URL, client ID and client secret';
    const urlProblem = await outboundUrlProblem(auth.tokenUrl);
    if (urlProblem) return `OAuth2 token URL: ${urlProblem}`;
  }
  return null;
}

// For list responses: secrets are never sent back, only a mask that
// sanitizeAuth recognises as "unchanged".
function maskAuth(auth) {
  if (!auth) return { type: 'NONE' };
  const out = { ...(auth.toObject ? auth.toObject() : auth) };
  for (const field of SECRET_FIELDS) {
    if (out[field]) out[field] = `${MASK}${String(out[field]).slice(-4)}`;
  }
  return out;
}

// --- OAuth2 client-credentials token cache --------------------------------

const tokenCache = new Map(); // cacheKey -> { token, expiresAt }

function tokenCacheKey(auth) {
  return `${auth.tokenUrl}|${auth.clientId}|${auth.scope}|${auth.audience}`;
}

function invalidateToken(auth) {
  if (auth?.type === 'OAUTH2') tokenCache.delete(tokenCacheKey(auth));
}

async function fetchOAuthToken(auth) {
  const key = tokenCacheKey(auth);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 30000) return cached.token;

  const problem = await outboundUrlProblem(auth.tokenUrl);
  if (problem) throw new Error(`OAuth2 token URL blocked: ${problem}`);

  const params = new URLSearchParams({ grant_type: 'client_credentials' });
  if (auth.scope) params.set('scope', auth.scope);
  if (auth.audience) params.set('audience', auth.audience);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (auth.clientAuth === 'HEADER') {
    headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(auth.clientId)}:${encodeURIComponent(auth.clientSecret)}`).toString('base64')}`;
  } else {
    params.set('client_id', auth.clientId);
    params.set('client_secret', auth.clientSecret);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  try {
    const res = await fetch(auth.tokenUrl, { method: 'POST', headers, body: params.toString(), signal: controller.signal, redirect: 'manual' });
    const text = (await res.text()).slice(0, 20000);
    let data;
    try { data = JSON.parse(text); } catch { data = Object.fromEntries(new URLSearchParams(text)); }
    if (!res.ok || !data.access_token) {
      throw new Error(`OAuth2 token request failed (HTTP ${res.status}): ${data.error_description || data.error || text.slice(0, 200)}`);
    }
    const expiresIn = Number(data.expires_in) > 0 ? Number(data.expires_in) : 3600;
    tokenCache.set(key, { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 });
    return data.access_token;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('OAuth2 token request timed out');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// --- Applying auth to one request -----------------------------------------

function hmacSignature(auth, body) {
  const digest = crypto.createHmac(auth.algorithm || 'sha256', auth.secret).update(body || '').digest(auth.encoding || 'hex');
  return `${auth.signaturePrefix || ''}${digest}`;
}

// Returns the url + headers to actually send. Applied AFTER the request is
// logged, so tokens, keys and signatures never land in the delivery log.
async function applyAuth(auth, { url, headers = {}, body }) {
  const out = { url, headers: { ...headers } };
  if (!auth || auth.type === 'NONE') return out;

  switch (auth.type) {
    case 'BASIC':
      out.headers.Authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
      break;
    case 'BEARER':
      out.headers.Authorization = `Bearer ${auth.token}`;
      break;
    case 'API_KEY':
      if (auth.keyIn === 'QUERY') {
        const u = new URL(url);
        u.searchParams.set(auth.keyName, auth.keyValue);
        out.url = u.toString();
      } else {
        out.headers[auth.keyName] = auth.keyValue;
      }
      break;
    case 'OAUTH2':
      out.headers.Authorization = `Bearer ${await fetchOAuthToken(auth)}`;
      break;
    case 'HMAC':
      out.headers[auth.signatureHeader || 'X-Signature'] = hmacSignature(auth, body);
      break;
    default:
      break;
  }
  return out;
}

// Inbound side: checks a signature a sender put on its request (e.g.
// X-Hub-Signature-256: sha256=<hex>) against the raw body, in constant time.
function verifyHmac(auth, rawBody, providedSignature) {
  if (!providedSignature) return false;
  const expected = Buffer.from(hmacSignature(auth, rawBody));
  const provided = Buffer.from(String(providedSignature).trim());
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

module.exports = {
  AUTH_TYPES,
  sanitizeAuth,
  authProblem,
  maskAuth,
  applyAuth,
  invalidateToken,
  verifyHmac,
  hmacSignature,
  MASK
};
