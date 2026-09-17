const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    adminId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['SUPER_ADMIN', 'ADMIN'], default: 'ADMIN' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    timezone: { type: String, default: 'UTC' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Admin', adminSchema);
