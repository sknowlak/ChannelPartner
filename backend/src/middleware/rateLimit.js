// Brute-force guard for the admin and partner login endpoints. Counts
// FAILED attempts (a 401/403 response) per client IP and per username/email
// within a sliding window; once either passes its limit, further attempts
// get 429 until the window moves on. A successful login doesn't count.
//
// In-memory on purpose (no Redis in this stack): limits are per backend
// process, which is enough for a single-instance deployment. Behind a
// reverse proxy, set TRUST_PROXY=1 so req.ip is the real client address.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 20;
const MAX_FAILURES_PER_ACCOUNT = 8;

const failures = new Map(); // key -> array of failure timestamps

function recent(key, now) {
  const list = (failures.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

function accountKey(req) {
  const id = req.body?.username ?? req.body?.email ?? '';
  return `acct:${req.baseUrl}${req.path}:${String(id).trim().toLowerCase()}`;
}

function loginRateLimit(req, res, next) {
  const now = Date.now();
  const ipKey = `ip:${req.baseUrl}${req.path}:${req.ip}`;
  const acctKey = accountKey(req);

  const ipCount = recent(ipKey, now).length;
  const acctCount = recent(acctKey, now).length;
  if (ipCount >= MAX_FAILURES_PER_IP || acctCount >= MAX_FAILURES_PER_ACCOUNT) {
    res.set('Retry-After', String(Math.ceil(WINDOW_MS / 1000)));
    return res.status(429).json({ reason: 'Too many failed login attempts - please try again in 15 minutes' });
  }

  res.on('finish', () => {
    if (res.statusCode !== 401 && res.statusCode !== 403) return;
    const at = Date.now();
    failures.set(ipKey, [...recent(ipKey, at), at]);
    failures.set(acctKey, [...recent(acctKey, at), at]);
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

// Drop stale keys now and then so the map can't grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const key of failures.keys()) recent(key, now);
  for (const [key, list] of signups) if (!list.some((t) => now - t < SIGNUP_WINDOW_MS)) signups.delete(key);
}, WINDOW_MS).unref();

module.exports = { loginRateLimit, signupRateLimit };
