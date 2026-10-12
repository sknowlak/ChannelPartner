const Admin = require('../../models/Admin');
const { verifyPassword, issueToken } = require('../../services/adminAuthService');
const { isSupportedLanguage } = require('../../config/languages');

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
      admin: { adminId: admin.adminId, name: admin.name, email: admin.email, role: admin.role, language: admin.language || '' }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/auth/me
async function me(req, res, next) {
  try {
    const admin = await Admin.findOne({ adminId: req.admin.adminId });
    return res.json({ admin: { ...req.admin, name: admin?.name, language: admin?.language || '' } });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/auth/me { language } - the admin's preferred UI language (section 54).
async function updateMe(req, res, next) {
  try {
    const { language } = req.body;
    if (language === undefined || (language !== '' && !isSupportedLanguage(language))) {
      return res.status(400).json({ reason: 'Unsupported language', fieldKey: 'language' });
    }
    await Admin.updateOne({ adminId: req.admin.adminId }, { $set: { language } });
    return res.json({ language });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, me, updateMe };
