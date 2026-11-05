// Brute-force guard for the admin and partner login endpoints. Counts
// FAILED attempts (a 401/403 response) within a sliding window; once a
// limit is passed, further attempts get 429 until the window moves on. A
// successful login doesn't count. Three counters:
//  - per client IP (any account): stops one machine spraying many accounts;
//  - per account + IP: the normal lockout. Keyed on the IP too, so someone
//    guessing from elsewhere can't lock the real user out of their account
//    by burning its attempts (previously 8 failures from ANY IP locked the
//    account for everyone);
//  - per account (any IP), with a much higher limit: still caps a slow
//    distributed guess against one account.
//
// In-memory on purpose (no Redis in this stack): limits are per backend
// process, which is enough for a single-instance deployment. Behind a
// reverse proxy, set TRUST_PROXY=1 so req.ip is the real client address.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 20;
const MAX_FAILURES_PER_ACCOUNT_IP = 8;
const MAX_FAILURES_PER_ACCOUNT = 100;

const failures = new Map(); // key -> array of failure timestamps

function recent(key, now) {
  const list = (failures.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

function accountId(req) {
  const id = req.body?.username ?? req.body?.email ?? '';
  return `${req.baseUrl}${req.path}:${String(id).trim().toLowerCase()}`;
}

function loginRateLimit(req, res, next) {
  const now = Date.now();
  const route = `${req.baseUrl}${req.path}`;
  const acct = accountId(req);
  const limits = [
    [`ip:${route}:${req.ip}`, MAX_FAILURES_PER_IP],
    [`acctip:${acct}:${req.ip}`, MAX_FAILURES_PER_ACCOUNT_IP],
    [`acct:${acct}`, MAX_FAILURES_PER_ACCOUNT]
  ];

  if (limits.some(([key, max]) => recent(key, now).length >= max)) {
    res.set('Retry-After', String(Math.ceil(WINDOW_MS / 1000)));
    return res.status(429).json({ reason: 'Too many failed login attempts - please try again in 15 minutes' });
  }

  res.on('finish', () => {
    if (res.statusCode !== 401 && res.statusCode !== 403) return;
    const at = Date.now();
    for (const [key] of limits) failures.set(key, [...recent(key, at), at]);
  });
  return next();
}

// Self-signup creates whole accounts, so every attempt counts (not just
// failures): at most 10 per IP per hour.
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const MAX_SIGNUPS_PER_IP = 10;
const signups = new Map();

function signupRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const list = (signups.get(key) || []).filter((t) => now - t < SIGNUP_WINDOW_MS);
  if (list.length >= MAX_SIGNUPS_PER_IP) {
    res.set('Retry-After', String(Math.ceil(SIGNUP_WINDOW_MS / 1000)));
    return res.status(429).json({ reason: 'Too many sign-ups from this network - please try again later' });
  }
  signups.set(key, [...list, now]);
  return next();
}

// Per-organisation limit for authenticated endpoints that can be used to
// probe or flood (duplicate check = "is this customer protected?", lead
// create). Every request counts. Stacks AFTER partnerAuth/apiKeyAuth - it
// keys on req.partnerId, so a whole team shares one budget, and the budget
// is per `name` so creates don't eat into duplicate checks.
// Imports (LinkedIn, receive/pull sources) call the handlers in-process and
// never pass through here.
const partnerHits = new Map(); // `${name}:${partnerId}` -> array of timestamps
const partnerWindows = new Map(); // key -> window length, for the sweep below

function partnerRateLimit({ name, max, windowMs = 10 * 60 * 1000 }) {
  return function perPartnerLimit(req, res, next) {
    if (!req.partnerId) return next();
    const now = Date.now();
    const key = `${name}:${req.partnerId}`;
    const list = (partnerHits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      const retryAfterMs = windowMs - (now - list[0]);
      res.set('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
      partnerHits.set(key, list);
      return res.status(429).json({ reason: `Too many requests - at most ${max} per ${Math.round(windowMs / 60000)} minutes. Please try again shortly` });
    }
    list.push(now);
    partnerHits.set(key, list);
    partnerWindows.set(key, windowMs);
    return next();
  };
}

const duplicateCheckRateLimit = partnerRateLimit({ name: 'duplicate-check', max: 120 });
const leadCreateRateLimit = partnerRateLimit({ name: 'lead-create', max: 300 });
// The integration API is built for system-to-system pushes (and already has
// apiKeyAuth's 600/minute ceiling), so its create budget is larger.
const integrationLeadCreateRateLimit = partnerRateLimit({ name: 'integration-lead-create', max: 1000 });

// Drop stale keys now and then so the maps can't grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const key of failures.keys()) recent(key, now);
  for (const [key, list] of signups) if (!list.some((t) => now - t < SIGNUP_WINDOW_MS)) signups.delete(key);
  for (const [key, list] of partnerHits) {
    if (!list.some((t) => now - t < (partnerWindows.get(key) || WINDOW_MS))) { partnerHits.delete(key); partnerWindows.delete(key); }
  }
}, WINDOW_MS).unref();

module.exports = {
  loginRateLimit,
  signupRateLimit,
  partnerRateLimit,
  duplicateCheckRateLimit,
  leadCreateRateLimit,
  integrationLeadCreateRateLimit
};
