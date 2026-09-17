const Admin = require('../../models/Admin');
const { verifyPassword, issueToken } = require('../../services/adminAuthService');

// POST /api/admin/auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ reason: 'email and password are required' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase(), status: 'ACTIVE' });
    if (!admin) return res.status(401).json({ reason: 'Invalid credentials' });

    const valid = await verifyPassword(password, admin.passwordHash);
    if (!valid) return res.status(401).json({ reason: 'Invalid credentials' });

    const token = issueToken(admin);
    return res.json({
      token,
      admin: { adminId: admin.adminId, name: admin.name, email: admin.email, role: admin.role }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/auth/me
async function me(req, res) {
  return res.json({ admin: req.admin });
}

module.exports = { login, me };
