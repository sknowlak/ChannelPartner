const Partner = require('../models/Partner');

// Authenticates the Integrations module's inbound endpoints (section 43) -
// "I can receive lead[s]" - via X-Api-Key instead of a login session, so a
// partner's own external CRM/system can push leads and progress updates in
// without ever having partner credentials. Sets req.partnerId/req.actorLabel
// the same way partnerAuth does, so the existing myLeadsController handlers
// (which only read those two fields, not anything JWT-specific) work
// unchanged for either auth method.
async function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ reason: 'Missing X-Api-Key header' });

  try {
    const partner = await Partner.findOne({ apiKey: String(key) });
    if (!partner || partner.status !== 'ACTIVE') {
      return res.status(401).json({ reason: 'Invalid API key' });
    }

    req.partnerId = partner.partnerId;
    req.actorLabel = `${partner.name} (Integration)`;
    return next();
  } catch (err) {
    // Express 4 doesn't catch rejected async middleware - without this a DB
    // error left the request hanging and surfaced as an unhandled rejection.
    return next(err);
  }
}

module.exports = apiKeyAuth;
