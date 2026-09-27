const mongoose = require('mongoose');

// Describes every field on THIS partner's "Add/Edit Team Member" form - the
// user-facing counterpart to LeadFieldDefinition (section 36), scoped
// per-partner the same way (section 38).
const userFieldDefinitionSchema = new mongoose.Schema(
  {
    partnerId: { type: String, required: true, index: true },
    fieldKey: { type: String, required: true },
    label: { type: String, required: true },
    group: { type: String, required: true },
    dataType: {
      type: String,
      enum: ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'LIST'],
      default: 'TEXT'
    },
    options: { type: [String], default: [] },
    isRequired: { type: Boolean, default: false },
    isEnabled: { type: Boolean, default: true },
    isCore: { type: Boolean, default: false },  // name/username/password - can't be disabled or made optional
    isCustom: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

userFieldDefinitionSchema.index({ partnerId: 1, fieldKey: 1 }, { unique: true });

module.exports = mongoose.model('UserFieldDefinition', userFieldDefinitionSchema);
