const UserFieldDefinition = require('../models/UserFieldDefinition');
const { BASE_USER_FIELD_DEFINITIONS } = require('../config/userFieldDefaults');

async function ensureBaseFields(partnerId) {
  const existingCount = await UserFieldDefinition.countDocuments({ partnerId, isCustom: false });
  if (existingCount > 0) return;
  await UserFieldDefinition.insertMany(BASE_USER_FIELD_DEFINITIONS.map((f) => ({ ...f, partnerId })));
}

async function listFieldDefinitions(partnerId) {
  await ensureBaseFields(partnerId); // self-heals partners that existed before this feature
  return UserFieldDefinition.find({ partnerId }).sort({ group: 1, sortOrder: 1 });
}

function slugify(label) {
  return 'custom_' + label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

async function createCustomField(partnerId, { label, group, dataType, options, isRequired }) {
  const fieldKey = slugify(label);
  return UserFieldDefinition.create({
    partnerId,
    fieldKey,
    label,
    group: group || 'Additional Details',
    dataType: dataType || 'TEXT',
    options: options || [],
    isRequired: !!isRequired,
    isEnabled: true,
    isCore: false,
    isCustom: true,
    sortOrder: 1000
  });
}

async function updateFieldDefinition(partnerId, fieldKey, updates) {
  const def = await UserFieldDefinition.findOne({ partnerId, fieldKey });
  if (!def) return { error: 'Field not found' };

  if (def.isCore && (updates.isEnabled === false || updates.isRequired === false)) {
    return { error: `"${def.label}" is a core field and must stay enabled and required` };
  }

  if (updates.label !== undefined) def.label = updates.label;
  if (updates.isEnabled !== undefined) def.isEnabled = updates.isEnabled;
  if (updates.isRequired !== undefined) def.isRequired = updates.isRequired;
  if (updates.options !== undefined && def.dataType === 'SELECT') def.options = updates.options;

  await def.save();
  return { def };
}

async function deleteCustomField(partnerId, fieldKey) {
  const def = await UserFieldDefinition.findOne({ partnerId, fieldKey });
  if (!def) return { error: 'Field not found' };
  if (!def.isCustom) return { error: 'Only custom fields can be deleted' };

  await UserFieldDefinition.deleteOne({ partnerId, fieldKey });
  return { deleted: true };
}

module.exports = {
  ensureBaseFields,
  listFieldDefinitions,
  createCustomField,
  updateFieldDefinition,
  deleteCustomField
};
