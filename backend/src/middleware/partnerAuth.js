const { verifyToken } = require('../services/partnerAuthService');
const Partner = require('../models/Partner');
const TeamMember = require('../models/TeamMember');

// Protects the /api/channel-partner/my/* surface - the self-service area a
// logged-in channel partner (or one of their team members) uses to manage
// leads. The original /api/channel-partner/registrations/* endpoints are
// left untouched (no auth layer) for server-to-server/simulated-CRM use,
// per spec section 6.
//
// The token is treated as identity only (partnerId + username) - role is
// ALWAYS re-derived from the database on every request, never trusted from
// the token's claims. Tokens can live for up to PARTNER_TOKEN_TTL (30 days
// by default), and baking role into the token meant an older token issued
// before a schema/claims change (or before a member's role changed) would
// silently keep acting on stale authorization data. Deriving it fresh here
// costs one extra lookup but means a token never needs to be reissued for
// its authorization to be correct.
async function partnerAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ reason: 'Missing or malformed Authorization header' });
  }

  try {
    const decoded = verifyToken(token);
    const partner = await Partner.findOne({ partnerId: decoded.partnerId });
    if (!partner || partner.status !== 'ACTIVE') {
      return res.status(401).json({ reason: 'Partner account is not active' });
    }

    let role = 'OWNER';
    let memberId = null;

    if (decoded.username !== partner.username) {
      const member = await TeamMember.findOne({ partnerId: decoded.partnerId, username: decoded.username });
      if (!member || member.status !== 'ACTIVE') {
        return res.status(401).json({ reason: 'Team member account is not active' });
      }
      role = 'MEMBER';
      memberId = member.memberId;
    }

    req.partnerId = decoded.partnerId;
    req.role = role;
    req.username = decoded.username;
    req.memberId = memberId;
    req.actorLabel = role === 'MEMBER' ? `${decoded.partnerId} (${decoded.username})` : decoded.partnerId;
    return next();
  } catch (err) {
    return res.status(401).json({ reason: 'Invalid or expired session' });
  }
}

// Additional gate for routes only the account owner may use (team
// management, org profile edits) - stack after partnerAuth.
function requireOwner(req, res, next) {
  if (req.role !== 'OWNER') {
    return res.status(403).json({ reason: 'Only the channel partner account owner can do this' });
  }
  return next();
}

module.exports = partnerAuth;
module.exports.requireOwner = requireOwner;
