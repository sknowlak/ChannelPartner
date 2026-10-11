const Partner = require('../models/Partner');
const { ALL_PERMISSIONS } = require('../config/permissions');

// Authenticates the partner's public integration API (sections 43 and 51)
// with the organisation's API key instead of a login session, so any other
// system can push leads in, read them back and subscribe to events.
//
// The key is accepted three ways, because not every tool can set a custom
// header: `X-Api-Key: <key>`, `Authorization: Bearer <key>`, or
// `?api_key=<key>` (last resort - query strings end up in proxy logs).
//
// The key stands for the whole organisation (only MANAGE_SETTINGS holders
// can see it, section 50), so requests made with it carry every permission.
// Sets req.partnerId/req.actorLabel the same way partnerAuth does, so the
// myLeadsController handlers work unchanged for either auth method.

const REQUESTS_PER_MINUTE = 600;
const usage = new Map(); // partnerId -> { windowStart, count }

function keyFrom(req) {
  if (req.headers['x-api-key']) return String(req.headers['x-api-key']);
  const [scheme, value] = String(req.headers.authorization || '').split(' ');
  if (scheme === 'Bearer' && value && value.startsWith('lr_')) return value;
  if (req.query.api_key) return String(req.query.api_key);
  return '';
}

function overLimit(partnerId) {
  const now = Date.now();
  const entry = usage.get(partnerId);
  if (!entry || now - entry.windowStart > 60000) {
    usage.set(partnerId, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > REQUESTS_PER_MINUTE;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of usage) if (now - v.windowStart > 60000) usage.delete(k);
}, 60000).unref();

async function apiKeyAuth(req, res, next) {
  const key = keyFrom(req);
  if (!key) return res.status(401).json({ reason: 'Missing API key - send it in the X-Api-Key header' });

  try {
    const partner = await Partner.findOne({ apiKey: key });
    if (!partner || partner.status !== 'ACTIVE') {
      return res.status(401).json({ reason: 'Invalid API key' });
    }
    if (overLimit(partner.partnerId)) {
      res.set('Retry-After', '60');
      return res.status(429).json({ reason: `Rate limit is ${REQUESTS_PER_MINUTE} requests per minute` });
    }

    req.partnerId = partner.partnerId;
    req.actorLabel = `${partner.name} (Integration)`;
    req.role = 'OWNER';
    req.permissions = ALL_PERMISSIONS;
    return next();
  } catch (err) {
    // Express 4 doesn't catch rejected async middleware - without this a DB
    // error left the request hanging and surfaced as an unhandled rejection.
    return next(err);
  }
}

module.exports = apiKeyAuth;
