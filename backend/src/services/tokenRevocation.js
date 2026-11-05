const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RevokedToken = require('../models/RevokedToken');

// Server-side logout (section 62): a logged-out token is refused by every
// auth middleware until it expires, instead of staying usable by anyone who
// copied it. Password changes and deactivation still sign out everywhere
// (passwordChangedAt / status); this ends just the one session.

const hashOf = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function bearerToken(req) {
  const [scheme, token] = String(req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

// Called after the auth middleware has verified the token, so `exp` is real.
async function revokeToken(token) {
  const decoded = jwt.decode(token) || {};
  const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await RevokedToken.updateOne({ tokenHash: hashOf(token) }, { $setOnInsert: { expiresAt } }, { upsert: true });
}

async function isRevoked(token) {
  return Boolean(await RevokedToken.exists({ tokenHash: hashOf(token) }));
}

// POST .../logout handler shared by the partner, builder and admin APIs.
async function logoutHandler(req, res, next) {
  try {
    const token = bearerToken(req);
    if (token) await revokeToken(token);
    return res.json({ loggedOut: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = { revokeToken, isRevoked, logoutHandler, bearerToken };
