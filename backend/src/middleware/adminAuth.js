const { verifyToken } = require('../services/adminAuthService');
const Admin = require('../models/Admin');

// Protects every /api/admin route except /api/admin/auth/login. Kept
// entirely separate from the channel-partner API.
//
// The admin is re-read on every request (same approach as partnerAuth), so
// deactivating an admin cuts them off immediately instead of leaving their
// token working until it expires, and req.admin.role reflects the database,
// not whatever was true at login.
async function adminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ reason: 'Missing or malformed Authorization header' });
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ reason: 'Invalid or expired admin token' });
  }

  try {
    const admin = await Admin.findOne({ adminId: decoded.adminId });
    if (!admin || admin.status !== 'ACTIVE') {
      return res.status(401).json({ reason: 'Admin account is not active' });
    }
    req.admin = { adminId: admin.adminId, email: admin.email, role: admin.role };
    return next();
  } catch (err) {
    return next(err);
  }
}

// Stacks after adminAuth for actions only a SUPER_ADMIN may take - business
// rules, field definitions, creating partners.
function requireSuperAdmin(req, res, next) {
  if (req.admin?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ reason: 'Only a Super Admin can do this' });
  }
  return next();
}

module.exports = adminAuth;
module.exports.requireSuperAdmin = requireSuperAdmin;
