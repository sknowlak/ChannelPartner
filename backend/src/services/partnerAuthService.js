const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { getJwtSecret } = require('../config/jwtSecret');

const JWT_SECRET = getJwtSecret();
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

// One password rule for every place a partner/member password is set
// (signup, member create, member edit, own profile) - previously only
// signup and member create checked it, so `PATCH /my/profile {password:"a"}`
// went through.
const MIN_PASSWORD_LENGTH = 8;
function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

// A token issued before the account's last password change is dead - so a
// password change (or reset by a team manager) actually locks out anyone
// holding an old token, instead of leaving it valid for the full 30 days.
// `iat` is whole seconds, hence the floor on passwordChangedAt.
function issuedBeforePasswordChange(decoded, account) {
  if (!account.passwordChangedAt) return false;
  return decoded.iat < Math.floor(account.passwordChangedAt.getTime() / 1000);
}

module.exports = {
  hashPassword,
  verifyPassword,
  issueToken,
  verifyToken,
  passwordProblem,
  issuedBeforePasswordChange
};
