const Settings = require('../models/Settings');
const {
  DEFAULT_DUPLICATE_PROTECTION_DAYS,
  DEFAULT_DUPLICATE_MATCH_FIELDS,
  DEFAULT_FIELD_VISIBILITY
} = require('../config/businessRules');

const SETTINGS_ID = 'GLOBAL_SETTINGS';

let cache = null;

async function ensureSettings() {
  let doc = await Settings.findById(SETTINGS_ID);
  if (!doc) {
    doc = await Settings.create({
      _id: SETTINGS_ID,
      duplicateProtectionDays: DEFAULT_DUPLICATE_PROTECTION_DAYS,
      duplicateMatchFields: DEFAULT_DUPLICATE_MATCH_FIELDS,
      fieldVisibility: DEFAULT_FIELD_VISIBILITY,
      updatedBy: 'SYSTEM'
    });
  }
  return doc;
}

// Cached read path - duplicate/visibility checks run on every registration
// request, so this avoids a DB round trip per call. Cache is invalidated on
// every admin update (see updateSettings).
async function getSettings() {
  if (cache) return cache;
  const doc = await ensureSettings();
  cache = doc.toObject();
  return cache;
}

async function updateSettings(partial, actor) {
  const doc = await ensureSettings();

  if (partial.duplicateProtectionDays !== undefined) doc.duplicateProtectionDays = partial.duplicateProtectionDays;
  if (partial.duplicateMatchFields !== undefined) doc.duplicateMatchFields = partial.duplicateMatchFields;
  if (partial.fieldVisibility !== undefined) doc.fieldVisibility = { ...doc.fieldVisibility, ...partial.fieldVisibility };
  doc.updatedBy = actor || 'ADMIN';

  await doc.save();
  cache = doc.toObject();
  return cache;
}

module.exports = { getSettings, updateSettings };
