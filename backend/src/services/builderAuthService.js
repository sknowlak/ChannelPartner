const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/jwtSecret');

const JWT_SECRET = getJwtSecret();
const TOKEN_TTL = process.env.BUILDER_TOKEN_TTL || '12h';

// Builder-portal sessions (section 52). `type: 'BUILDER'` keeps them from
// being accepted on partner or admin routes, and vice versa. Identity only -
// builderAuth re-reads the user and organization on every request.
function issueToken(user) {
  return jwt.sign({ type: 'BUILDER', builderUserId: user.builderUserId, builderId: user.builderId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.type !== 'BUILDER') throw new Error('Not a builder token');
  return decoded;
}

module.exports = { issueToken, verifyToken };
