const {
  listFieldDefinitions,
  createCustomField,
  updateFieldDefinition,
  deleteCustomField
} = require('../services/userFieldDefinitionService');
const { logEvent } = require('../services/auditService');

// GET /api/channel-partner/my/user-fields
// Readable by the whole team - needed to render the Add/Edit Team Member
// forms identically for everyone.
async function list(req, res, next) {
  try {
    const definitions = await listFieldDefinitions(req.partnerId);
    return res.json({ definitions });
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/user-fields  (requires MANAGE_SETTINGS)
async function create(req, res, next) {
  try {
    const { label, group, dataType, options, isRequired } = req.body;
    if (!label) return res.status(400).json({ reason: 'label is required' });

    const def = await createCustomField(req.partnerId, { label, group, dataType, options, isRequired });

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'USER_FIELD_CREATED',
      actor: req.actorLabel,
      newValue: { fieldKey: def.fieldKey, label: def.label, dataType: def.dataType },
      description: `Added custom user field "${def.label}"`
    });

    return res.status(201).json(def);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ reason: 'A field with this name already exists' });
    next(err);
  }
}

// PATCH /api/channel-partner/my/user-fields/:fieldKey  (requires MANAGE_SETTINGS)
async function update(req, res, next) {
  try {
    const { fieldKey } = req.params;
    const { def, error } = await updateFieldDefinition(req.partnerId, fieldKey, req.body);
    if (error) return res.status(400).json({ reason: error });

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'USER_FIELD_UPDATED',
      actor: req.actorLabel,
      newValue: req.body,
      description: `Updated user field "${fieldKey}"`
    });

    return res.json(def);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/channel-partner/my/user-fields/:fieldKey  (requires MANAGE_SETTINGS)
async function remove(req, res, next) {
  try {
    const { fieldKey } = req.params;
    const result = await deleteCustomField(req.partnerId, fieldKey);
    if (result.error) return res.status(400).json({ reason: result.error });

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'USER_FIELD_DELETED',
      actor: req.actorLabel,
      description: `Deleted custom user field "${fieldKey}"`
    });

    return res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
