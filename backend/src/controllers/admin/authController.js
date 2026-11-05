const Admin = require('../../models/Admin');
const bcrypt = require('bcryptjs');
const { verifyPassword, issueToken } = require('../../services/adminAuthService');
const { isSupportedLanguage } = require('../../config/languages');

// Compared against when no active admin has the given email, so a miss costs
// the same bcrypt time as a wrong password - otherwise the response time
// tells an attacker which admin emails exist. Computed once at load.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 10);

// POST /api/admin/auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ reason: 'email and password are required' });
    }

    const admin = await Admin.findOne({ email: String(email).toLowerCase(), status: 'ACTIVE' });
    // bcrypt runs whether or not the account exists (see DUMMY_HASH).
    const valid = await verifyPassword(String(password), admin ? admin.passwordHash : DUMMY_HASH);
    if (!admin || !valid) return res.status(401).json({ reason: 'Invalid credentials' });

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
