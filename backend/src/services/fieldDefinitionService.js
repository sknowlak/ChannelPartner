const FieldDefinition = require('../models/FieldDefinition');
const { BASE_FIELD_DEFINITIONS } = require('../config/partnerFieldDefaults');

async function ensureBaseFields() {
  const existingCount = await FieldDefinition.countDocuments({ isCustom: false });
  if (existingCount > 0) return;
  await FieldDefinition.insertMany(BASE_FIELD_DEFINITIONS);
}

async function listFieldDefinitions() {
  return FieldDefinition.find().sort({ group: 1, sortOrder: 1 });
}

async function createCustomField({ fieldKey, label, group, dataType, options, isRequired }) {
  return FieldDefinition.create({
    fieldKey,
    label,
    group: group || 'Custom',
    dataType: dataType || 'TEXT',
    options: options || [],
    isRequired: !!isRequired,
    isEnabled: true,
    isSystemGenerated: false,
    isCustom: true,
    sortOrder: 1000
  });
}

async function updateFieldDefinition(fieldKey, updates) {
  const def = await FieldDefinition.findOne({ fieldKey });
  if (!def) return null;

  if (updates.label !== undefined) def.label = updates.label;
  if (updates.isEnabled !== undefined) def.isEnabled = updates.isEnabled;
  if (updates.isRequired !== undefined) def.isRequired = updates.isRequired;
  if (updates.options !== undefined && def.dataType === 'SELECT') def.options = updates.options;

  await def.save();
  return def;
}

async function deleteCustomField(fieldKey) {
  const def = await FieldDefinition.findOne({ fieldKey });
  if (!def) return { deleted: false, reason: 'Field not found' };
  if (!def.isCustom) return { deleted: false, reason: 'Only custom fields can be deleted' };

  await FieldDefinition.deleteOne({ fieldKey });
  return { deleted: true };
}

module.exports = {
  ensureBaseFields,
  listFieldDefinitions,
  createCustomField,
  updateFieldDefinition,
  deleteCustomField
};
