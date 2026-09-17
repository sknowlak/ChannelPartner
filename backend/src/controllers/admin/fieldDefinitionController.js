const {
  listFieldDefinitions,
  createCustomField,
  updateFieldDefinition,
  deleteCustomField
} = require('../../services/fieldDefinitionService');
const { logEvent } = require('../../services/auditService');

// GET /api/admin/field-definitions
async function list(req, res, next) {
  try {
    const definitions = await listFieldDefinitions();
    return res.json({ definitions });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/field-definitions
async function create(req, res, next) {
  try {
    const { fieldKey, label, group, dataType, options, isRequired } = req.body;
    if (!fieldKey || !label) return res.status(400).json({ reason: 'fieldKey and label are required' });

    const def = await createCustomField({ fieldKey, label, group, dataType, options, isRequired });

    await logEvent({
      registrationId: 'FIELD_DEFINITIONS',
      eventType: 'ADMIN_CUSTOM_FIELD_CREATED',
      actor: `ADMIN:${req.admin.email}`,
      newValue: { fieldKey, label, dataType },
      description: `Admin created custom partner field "${label}" (${fieldKey})`
    });

    return res.status(201).json(def);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ reason: `Field key already exists` });
    next(err);
  }
}

// PATCH /api/admin/field-definitions/:fieldKey
async function update(req, res, next) {
  try {
    const { fieldKey } = req.params;
    const def = await updateFieldDefinition(fieldKey, req.body);
    if (!def) return res.status(404).json({ reason: 'Field definition not found' });

    await logEvent({
      registrationId: 'FIELD_DEFINITIONS',
      eventType: 'ADMIN_FIELD_DEFINITION_UPDATED',
      actor: `ADMIN:${req.admin.email}`,
      newValue: req.body,
      description: `Admin updated field "${fieldKey}"`
    });

    return res.json(def);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/field-definitions/:fieldKey
async function remove(req, res, next) {
  try {
    const { fieldKey } = req.params;
    const result = await deleteCustomField(fieldKey);
    if (!result.deleted) return res.status(400).json({ reason: result.reason });

    await logEvent({
      registrationId: 'FIELD_DEFINITIONS',
      eventType: 'ADMIN_CUSTOM_FIELD_DELETED',
      actor: `ADMIN:${req.admin.email}`,
      description: `Admin deleted custom field "${fieldKey}"`
    });

    return res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
