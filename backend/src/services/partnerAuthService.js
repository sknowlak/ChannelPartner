const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';
const TOKEN_TTL = process.env.PARTNER_TOKEN_TTL || '30d';

async function hashPassword(plainText) {
  return bcrypt.hash(plainText, 10);
}

async function verifyPassword(plainText, passwordHash) {
  return bcrypt.compare(plainText, passwordHash);
}

// `type: 'PARTNER'` keeps a partner's token from being accepted on admin
// routes (and vice versa) even though both currently share JWT_SECRET.
// Deliberately identity-only (partnerId + username) - no role/memberId
// claim. Tokens live up to PARTNER_TOKEN_TTL (30 days default); baking
// authorization data into them means an older token would keep acting on
// whatever was true at login time. partnerAuth middleware re-derives role
// from the database on every request instead (section 32).
function issueToken({ partnerId, username }) {
  return jwt.sign(
    { type: 'PARTNER', partnerId, username },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function verifyToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.type !== 'PARTNER') throw new Error('Not a partner token');
  return decoded;
}

module.exports = { hashPassword, verifyPassword, issueToken, verifyToken };
