const { getSettings, updateSettings } = require('../../services/settingsService');
const { logEvent } = require('../../services/auditService');

// GET /api/admin/settings
async function getSettingsHandler(req, res, next) {
  try {
    const settings = await getSettings();
    return res.json(settings);
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/settings
async function updateSettingsHandler(req, res, next) {
  try {
    const { duplicateProtectionDays, duplicateMatchFields, fieldVisibility } = req.body;
    const before = await getSettings();

    const updated = await updateSettings(
      { duplicateProtectionDays, duplicateMatchFields, fieldVisibility },
      `ADMIN:${req.admin.email}`
    );

    await logEvent({
      registrationId: 'SETTINGS:GLOBAL_SETTINGS',
      eventType: 'ADMIN_SETTINGS_UPDATED',
      actor: `ADMIN:${req.admin.email}`,
      previousValue: before,
      newValue: updated,
      description: 'Admin updated global business rule settings'
    });

    return res.json(updated);
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettingsHandler, updateSettingsHandler };
