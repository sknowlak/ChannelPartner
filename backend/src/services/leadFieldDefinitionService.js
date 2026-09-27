const LeadFieldDefinition = require('../models/LeadFieldDefinition');
const { BASE_LEAD_FIELD_DEFINITIONS } = require('../config/leadFieldDefaults');

// Additive, not "seed once": inserts whichever base fieldKeys this partner
// doesn't have yet, without touching ones they already have (so a partner's
// own enable/require toggles on existing fields survive future additions to
// BASE_LEAD_FIELD_DEFINITIONS - section 39 added ~30 new base fields and this
// is what makes them show up for partners who registered before that).
async function ensureBaseFields(partnerId) {
  const existingKeys = new Set((await LeadFieldDefinition.find({ partnerId }, 'fieldKey')).map((d) => d.fieldKey));
  const missing = BASE_LEAD_FIELD_DEFINITIONS.filter((f) => !existingKeys.has(f.fieldKey));
  if (missing.length === 0) return;
  await LeadFieldDefinition.insertMany(missing.map((f) => ({ ...f, partnerId })));
}

async function listFieldDefinitions(partnerId) {
  await ensureBaseFields(partnerId); // self-heals partners that existed before this feature
  return LeadFieldDefinition.find({ partnerId }).sort({ group: 1, sortOrder: 1 });
}

function slugify(label) {
  return 'custom_' + label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

async function createCustomField(partnerId, { label, group, dataType, options, isRequired }) {
  const fieldKey = slugify(label);
  return LeadFieldDefinition.create({
    partnerId,
    fieldKey,
    label,
    group: group || 'Additional Details',
    scope: 'custom',
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
  const def = await LeadFieldDefinition.findOne({ partnerId, fieldKey });
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
  const def = await LeadFieldDefinition.findOne({ partnerId, fieldKey });
  if (!def) return { error: 'Field not found' };
  if (!def.isCustom) return { error: 'Only custom fields can be deleted' };

  await LeadFieldDefinition.deleteOne({ partnerId, fieldKey });
  return { deleted: true };
}

module.exports = {
  ensureBaseFields,
  listFieldDefinitions,
  createCustomField,
  updateFieldDefinition,
  deleteCustomField
};
