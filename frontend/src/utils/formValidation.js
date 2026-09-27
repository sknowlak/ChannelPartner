import { validateMobile } from './phone';

// Shared by every DynamicFieldInput-driven form (RegisterLead, EditLead,
// ManageTeam, EditTeamMember). Required fields are partner-configurable
// (Settings > Lead/User), so which fields are required isn't known until
// `fieldDefs` loads - this can't be hardcoded per form. Mobile fields are
// additionally format-checked (country code + valid-for-that-country),
// regardless of whether they're marked required.

const isEmpty = (value) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

// Returns { fieldKey, group, message }[], in the same order as `fieldDefs`
// (so "first error" is well-defined for tab-switching).
export function findFieldErrors(fieldDefs, values) {
  const errors = [];
  for (const def of fieldDefs) {
    const value = values[def.fieldKey];
    const empty = isEmpty(value);
    if (def.isRequired && empty) {
      errors.push({ fieldKey: def.fieldKey, group: def.group, message: `${def.label} is required.` });
      continue;
    }
    if (!empty && (def.fieldKey === 'mobile' || def.fieldKey === 'alternateMobile')) {
      const check = validateMobile(value);
      if (!check.valid) errors.push({ fieldKey: def.fieldKey, group: def.group, message: check.reason });
    }
  }
  return errors;
}

// Scrolls the field's wrapper (id="field-<fieldKey>", set by every form
// below) into view and focuses its input - this is what makes a validation
// error something the user can act on immediately instead of a message they
// have to go hunting for the cause of.
export function focusField(fieldKey) {
  requestAnimationFrame(() => {
    const wrapper = document.getElementById(`field-${fieldKey}`);
    if (!wrapper) return;
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    wrapper.querySelector('input, select, textarea')?.focus();
  });
}
