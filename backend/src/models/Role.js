const mongoose = require('mongoose');
const { ALL_PERMISSIONS } = require('../config/permissions');

// Roles are scoped per-partner (each channel partner org manages its own
// team and can define its own custom roles) - section 34. Super
// Admin/Admin/Manager are seeded automatically at registration and are
// immutable; anything else an owner creates is a custom role.
const roleSchema = new mongoose.Schema(
  {
    roleId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    isSystem: { type: Boolean, default: false },
    permissions: { type: [String], default: [], enum: ALL_PERMISSIONS }
  },
  { timestamps: true }
);

roleSchema.index({ partnerId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Role', roleSchema);
