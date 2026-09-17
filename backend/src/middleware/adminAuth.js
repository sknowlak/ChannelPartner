const { verifyToken } = require('../services/adminAuthService');

// Protects every /api/admin route except /api/admin/auth/login. Kept
// entirely separate from the channel-partner API, which has no auth layer
// of its own (partner/builder identity there is asserted by the caller).
function adminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ reason: 'Missing or malformed Authorization header' });
  }

  try {
    req.admin = verifyToken(token);
    return next();
  } catch (err) {
    return res.status(401).json({ reason: 'Invalid or expired admin token' });
  }
}

module.exports = adminAuth;
