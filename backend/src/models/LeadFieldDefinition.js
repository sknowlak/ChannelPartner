const mongoose = require('mongoose');

// Describes every field on THIS partner's lead capture form - both the
// standard fields (section 33) and any custom field they've added. Scoped
// per-partner (unlike the platform-wide Channel Partner FieldDefinition
// from section 30) since each channel partner customizes their own lead
// form independently (section 36).
const leadFieldDefinitionSchema = new mongoose.Schema(
  {
    partnerId: { type: String, required: true, index: true },
    fieldKey: { type: String, required: true },
    label: { type: String, required: true },
    group: { type: String, required: true },
    scope: { type: String, enum: ['customer', 'registration', 'custom'], required: true },
    dataType: {
      type: String,
      enum: ['TEXT', 'TEXTAREA', 'NUMBER', 'CURRENCY', 'DATE', 'BOOLEAN', 'SELECT', 'LIST'],
      default: 'TEXT'
    },
    options: { type: [String], default: [] }, // used when dataType === 'SELECT'
    isRequired: { type: Boolean, default: false },
    isEnabled: { type: Boolean, default: true },
    isCore: { type: Boolean, default: false },   // name/mobile - can't be disabled or made optional
    isCustom: { type: Boolean, default: false },  // true only for partner-added fields beyond the base set
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

leadFieldDefinitionSchema.index({ partnerId: 1, fieldKey: 1 }, { unique: true });

module.exports = mongoose.model('LeadFieldDefinition', leadFieldDefinitionSchema);
