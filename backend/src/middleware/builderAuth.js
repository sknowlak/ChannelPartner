const { verifyToken } = require('../services/builderAuthService');
const { issuedBeforePasswordChange } = require('../services/partnerAuthService');
const BuilderUser = require('../models/BuilderUser');
const Builder = require('../models/Builder');

// Protects /api/builder/* (section 52). The user AND their organization are
// re-read on every request, so deactivating either (or changing the
// password) cuts access off immediately.
async function builderAuth(req, res, next) {
  const [scheme, token] = String(req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ reason: 'Missing or malformed Authorization header' });

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    return res.status(401).json({ reason: 'Invalid or expired session' });
  }

  try {
    const user = await BuilderUser.findOne({ builderUserId: decoded.builderUserId });
    if (!user || user.status !== 'ACTIVE' || user.builderId !== decoded.builderId) {
      return res.status(401).json({ reason: 'Builder account is not active' });
    }
    if (issuedBeforePasswordChange(decoded, user)) return res.status(401).json({ reason: 'Password was changed - please log in again' });
    const builder = await Builder.findOne({ builderId: user.builderId });
    if (!builder || builder.status !== 'ACTIVE') return res.status(401).json({ reason: 'Builder organization is not active' });

    req.builder = { builderId: builder.builderId, name: builder.name };
    req.builderUser = user;
    req.actorLabel = `${user.name} (Builder: ${builder.name})`;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = builderAuth;
