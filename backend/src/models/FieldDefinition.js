const mongoose = require('mongoose');

// Describes every field that can appear on a Partner record - both the
// standard fields modeled on the Partner schema and any custom field an
// admin has added. The admin portal's partner form is rendered from this
// list, so enabling/disabling or adding a field here changes the form
// without a code change.
const fieldDefinitionSchema = new mongoose.Schema(
  {
    fieldKey: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    group: { type: String, required: true },
    dataType: {
      type: String,
      enum: ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'LIST'],
      default: 'TEXT'
    },
    options: { type: [String], default: [] }, // used when dataType === 'SELECT'
    isRequired: { type: Boolean, default: false },
    isEnabled: { type: Boolean, default: true },
    isSystemGenerated: { type: Boolean, default: false }, // e.g. partnerCode, status - not partner-entered
    isCustom: { type: Boolean, default: false }, // true only for admin-added fields beyond the base set
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('FieldDefinition', fieldDefinitionSchema);
