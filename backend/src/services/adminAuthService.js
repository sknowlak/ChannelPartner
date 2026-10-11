const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { getJwtSecret } = require('../config/jwtSecret');

const JWT_SECRET = getJwtSecret();
const TOKEN_TTL = process.env.ADMIN_TOKEN_TTL || '8h';

async function hashPassword(plainText) {
  return bcrypt.hash(plainText, 10);
}

async function verifyPassword(plainText, passwordHash) {
  return bcrypt.compare(plainText, passwordHash);
}

// `type: 'ADMIN'` keeps an admin's token from being accepted on partner
// routes (and vice versa) even though both currently share JWT_SECRET.
function issueToken(admin) {
  return jwt.sign(
    { type: 'ADMIN', adminId: admin.adminId, email: admin.email, role: admin.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function verifyToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.type !== 'ADMIN') throw new Error('Not an admin token');
  return decoded;
}

module.exports = { hashPassword, verifyPassword, issueToken, verifyToken };
