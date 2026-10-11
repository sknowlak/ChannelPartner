const { isValidEmail } = require('./email');

// Server-side check of one incoming lead field value against its
// LeadFieldDefinition (section 36). Before this, values were stored as-is
// into a Mixed field - nested objects, megabyte strings, or a SELECT value
// that isn't one of the options all went straight into the database and on
// to webhooks/grids. Empty values pass here; "required" is checked
// separately by the callers.
const MAX_TEXT = 1000;
const MAX_TEXTAREA = 5000;
const MAX_LIST_ITEMS = 100;
const MAX_LIST_ITEM = 200;

function isEmpty(value) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function fieldValueProblem(def, value) {
  if (isEmpty(value)) return null;
  const label = def.label || def.fieldKey;

  if (typeof value === 'object' && !Array.isArray(value)) return `${label} has an invalid value`;

  switch (def.dataType) {
    case 'NUMBER':
    case 'CURRENCY':
      return Number.isFinite(Number(value)) ? null : `${label} must be a number`;
    case 'DATE':
      return typeof value === 'string' && !Number.isNaN(new Date(value).getTime()) ? null : `${label} must be a valid date`;
    case 'BOOLEAN':
      return [true, false, 'true', 'false'].includes(value) ? null : `${label} must be true or false`;
    case 'SELECT':
      if (typeof value !== 'string') return `${label} has an invalid value`;
      return !def.options?.length || def.options.includes(value) ? null : `"${value}" is not an option for ${label}`;
    case 'LIST': {
      const items = Array.isArray(value) ? value : [value];
      if (items.length > MAX_LIST_ITEMS) return `${label} can have at most ${MAX_LIST_ITEMS} entries`;
      const bad = items.some((v) => typeof v !== 'string' || v.length > MAX_LIST_ITEM);
      return bad ? `${label} must be a list of short text values` : null;
    }
    default: {
      if (Array.isArray(value) || (typeof value !== 'string' && typeof value !== 'number')) return `${label} has an invalid value`;
      const max = def.dataType === 'TEXTAREA' ? MAX_TEXTAREA : MAX_TEXT;
      if (String(value).length > max) return `${label} can be at most ${max} characters`;
      if (def.fieldKey === 'email' && !isValidEmail(String(value))) return 'Enter a valid email address';
      return null;
    }
  }
}

module.exports = { fieldValueProblem, isEmpty };
