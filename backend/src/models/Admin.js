const mongoose = require('mongoose');
const { isSupportedLanguage } = require('../config/languages');

const adminSchema = new mongoose.Schema(
  {
    adminId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['SUPER_ADMIN', 'ADMIN'], default: 'ADMIN' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    timezone: { type: String, default: 'UTC' },
    // Preferred UI language (sections 54-55) - '' = not chosen yet (device/browser
    // decides). Any language in config/languages.json (the generated manifest).
    language: { type: String, default: '', validate: { validator: (v) => v === '' || isSupportedLanguage(v), message: 'Unsupported language' } }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Admin', adminSchema);
