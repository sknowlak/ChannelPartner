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

const MATCH_FIELDS = ['mobile', 'email'];

// Business rules drive every duplicate decision, so nonsense values are
// refused: a negative/zero window would grant no protection, and an empty
// match-field list would switch duplicate protection off altogether.
function settingsProblem(partial) {
  if (partial.duplicateProtectionDays !== undefined) {
    const days = Number(partial.duplicateProtectionDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) return 'duplicateProtectionDays must be a whole number from 1 to 3650';
  }
  if (partial.duplicateMatchFields !== undefined) {
    const fields = partial.duplicateMatchFields;
    if (!Array.isArray(fields) || fields.length === 0 || fields.some((f) => !MATCH_FIELDS.includes(f))) {
      return `duplicateMatchFields must be a non-empty list from: ${MATCH_FIELDS.join(', ')}`;
    }
  }
  return null;
}

async function updateSettings(partial, actor) {
  const problem = settingsProblem(partial);
  if (problem) {
    const err = new Error(problem);
    err.statusCode = 400;
    throw err;
  }
  const doc = await ensureSettings();

  if (partial.duplicateProtectionDays !== undefined) doc.duplicateProtectionDays = Number(partial.duplicateProtectionDays);
  if (partial.duplicateMatchFields !== undefined) doc.duplicateMatchFields = [...new Set(partial.duplicateMatchFields)];
  if (partial.fieldVisibility !== undefined) doc.fieldVisibility = { ...doc.fieldVisibility, ...partial.fieldVisibility };
  doc.updatedBy = actor || 'ADMIN';

  await doc.save();
  cache = doc.toObject();
  return cache;
}

module.exports = { getSettings, updateSettings };
