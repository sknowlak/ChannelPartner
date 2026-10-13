const { linkedinConfig } = require('../../config/linkedin');
const { seal, open } = require('../../utils/secretBox');
const { logActivity } = require('../connectorActivityService');

// Thin client for LinkedIn's OAuth endpoints and versioned Marketing API
// (section 59). Every API call sends LinkedIn-Version and the Rest.li 2.0
// protocol header; the member's access token is refreshed automatically
// when it is about to expire. Rest.li query strings are built by the
// callers (helpers below) because LinkedIn's (key:value) syntax must keep
// its brackets/colons literal while URNs inside it are URL-encoded.

const TIMEOUT_MS = 20000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

class LinkedInError extends Error {
  constructor(message, { status = 0, retryable = false, needsReconnect = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.needsReconnect = needsReconnect;
  }
}

const enc = (urn) => encodeURIComponent(urn);
const idOf = (urn) => String(urn || '').split(':').pop();

async function httpJson(url, { method = 'GET', headers = {}, body, form } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...headers,
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: form ? new URLSearchParams(form).toString() : body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      redirect: 'manual'
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
    return { status: res.status, data, headers: res.headers };
  } catch (err) {
    throw new LinkedInError(err.name === 'AbortError' ? 'LinkedIn did not respond in time' : `Could not reach LinkedIn: ${err.message}`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

const errorText = (data, status) => data?.message || data?.error_description || data?.error || `HTTP ${status}`;

// ---- OAuth -------------------------------------------------------------

function authorizeUrl(state) {
  const c = linkedinConfig();
  const q = new URLSearchParams({ response_type: 'code', client_id: c.clientId, redirect_uri: c.redirectUri, state, scope: c.scopes.join(' ') });
  return `${c.authBase}/authorization?${q.toString()}`;
}

async function tokenRequest(form) {
  const c = linkedinConfig();
  const r = await httpJson(`${c.authBase}/accessToken`, { method: 'POST', form: { ...form, client_id: c.clientId, client_secret: c.clientSecret } });
  if (r.status !== 200 || !r.data?.access_token) {
    throw new LinkedInError(`LinkedIn sign-in failed: ${errorText(r.data, r.status)}`, { status: r.status, needsReconnect: r.status >= 400 && r.status < 500 });
  }
  return r.data;
}

// Converts a token response into the (encrypted) fields stored on the connection.
function tokenFields(t, now = Date.now()) {
  const fields = {
    accessToken: seal(t.access_token),
    accessTokenExpiresAt: new Date(now + Number(t.expires_in || 0) * 1000),
    scopes: t.scope ? String(t.scope).split(/[ ,]+/).filter(Boolean) : undefined
  };
  if (t.refresh_token) {
    fields.refreshToken = seal(t.refresh_token);
    fields.refreshTokenExpiresAt = new Date(now + Number(t.refresh_token_expires_in || 0) * 1000);
  }
  return fields;
}

const exchangeCode = (code) => tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: linkedinConfig().redirectUri });

// A valid access token for the connection, refreshing it (and saving the
// new one) when it expires within 5 minutes. No usable refresh token ->
// the partner must reconnect.
async function accessTokenFor(conn) {
  const expiresAt = conn.accessTokenExpiresAt ? conn.accessTokenExpiresAt.getTime() : 0;
  if (conn.accessToken && expiresAt - Date.now() > REFRESH_MARGIN_MS) return open(conn.accessToken);

  const refreshUsable = conn.refreshToken && (!conn.refreshTokenExpiresAt || conn.refreshTokenExpiresAt.getTime() > Date.now());
  if (!refreshUsable) throw new LinkedInError('The LinkedIn connection has expired - reconnect LinkedIn', { needsReconnect: true });

  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: open(conn.refreshToken) });
  Object.assign(conn, tokenFields(t));
  await conn.save();
  await logActivity(conn.partnerId, 'TOKEN_REFRESHED', { message: 'LinkedIn access renewed automatically' });
  return t.access_token;
}

// ---- API ---------------------------------------------------------------

// path: e.g. '/adAccountUsers'; query: a pre-built Rest.li query string.
async function liRequest(conn, method, path, { query = '', body, restliMethod, base, retried = false } = {}) {
  const c = linkedinConfig();
  const token = await accessTokenFor(conn);
  const url = `${base || c.apiBase}${path}${query ? `?${query}` : ''}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': c.apiVersion,
    'X-Restli-Protocol-Version': '2.0.0',
    ...(restliMethod ? { 'X-RestLi-Method': restliMethod } : {})
  };
  const r = await httpJson(url, { method, headers, body });
  if (r.status === 401 && !retried && conn.refreshToken) {
    // Token revoked or expired early: refresh once, then retry.
    conn.accessTokenExpiresAt = new Date(0);
    return liRequest(conn, method, path, { query, body, restliMethod, base, retried: true });
  }
  if (r.status === 401) throw new LinkedInError('LinkedIn rejected the access token - reconnect LinkedIn', { status: 401, needsReconnect: true });
  if (r.status === 403) throw new LinkedInError(`LinkedIn denied access: ${errorText(r.data, r.status)} (check the member's role on the ad account and company page, and the app's approved products)`, { status: 403 });
  if (r.status === 429 || r.status >= 500) throw new LinkedInError(`LinkedIn is busy (${errorText(r.data, r.status)})`, { status: r.status, retryable: true });
  if (r.status >= 400) throw new LinkedInError(`LinkedIn error: ${errorText(r.data, r.status)}`, { status: r.status });
  return r;
}

// Best effort: the connected member's display name - /v2/me (r_basicprofile),
// else OpenID Connect /v2/userinfo (openid + profile scopes).
async function memberProfile(conn) {
  const base = linkedinConfig().apiBase.replace(/\/rest$/, '/v2');
  try {
    const r = await liRequest(conn, 'GET', '/me', { base });
    const name = [r.data?.localizedFirstName, r.data?.localizedLastName].filter(Boolean).join(' ');
    if (name) return { name, urn: r.data?.id ? `urn:li:person:${r.data.id}` : '' };
  } catch { /* try OpenID Connect */ }
  try {
    const r = await liRequest(conn, 'GET', '/userinfo', { base });
    return { name: r.data?.name || [r.data?.given_name, r.data?.family_name].filter(Boolean).join(' '), urn: r.data?.sub ? `urn:li:person:${r.data.sub}` : '' };
  } catch {
    return { name: '', urn: '' };
  }
}

// Ad accounts the member has a role on, with name and currency.
async function listAdAccounts(conn) {
  const r = await liRequest(conn, 'GET', '/adAccountUsers', { query: 'q=authenticatedUser' });
  const roles = (r.data?.elements || []).filter((e) => e.account);
  const accounts = [];
  for (const e of roles.slice(0, 50)) {
    let info = {};
    try { info = (await liRequest(conn, 'GET', `/adAccounts/${idOf(e.account)}`)).data || {}; } catch { /* name stays empty */ }
    accounts.push({ accountUrn: e.account, role: e.role || '', name: info.name || '', currency: info.currency || '', status: info.status || '' });
  }
  return accounts;
}

// Campaign URN -> name for an ad account.
async function campaignNames(conn, accountUrn) {
  const names = new Map();
  let pageToken = '';
  for (let i = 0; i < 20; i++) {
    const query = `q=search&pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const r = await liRequest(conn, 'GET', `/adAccounts/${idOf(accountUrn)}/adCampaigns`, { query });
    for (const c of r.data?.elements || []) names.set(`urn:li:sponsoredCampaign:${c.id}`, c.name || '');
    pageToken = r.data?.metadata?.nextPageToken || '';
    if (!pageToken) break;
  }
  return names;
}

module.exports = {
  LinkedInError, enc, idOf, authorizeUrl, exchangeCode, tokenFields, accessTokenFor, liRequest,
  memberProfile, listAdAccounts, campaignNames, httpJson
};
