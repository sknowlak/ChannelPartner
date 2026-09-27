// Default UserFieldDefinition rows for the "Add Team Member" / "Edit Team
// Member" form (section 38) - the same admin-configurable-fields pattern as
// leads (section 36), applied to team members ("users") instead. Seeded
// once per partner.

let order = 0;
const row = (fieldKey, label, group, overrides = {}) => ({
  fieldKey,
  label,
  group,
  dataType: 'TEXT',
  options: [],
  isRequired: false,
  isEnabled: true,
  isCore: false,
  isCustom: false,
  sortOrder: order++,
  ...overrides
});

const BASE_USER_FIELD_DEFINITIONS = [
  // Core - always present, always required, cannot be disabled (a login needs these)
  row('name', 'Name', 'Basic Information', { isRequired: true, isCore: true }),
  row('username', 'Username', 'Basic Information', { isRequired: true, isCore: true }),
  row('password', 'Password', 'Basic Information', { isRequired: true, isCore: true }),

  // Optional, configurable
  row('mobile', 'Mobile', 'Basic Information'),
  row('email', 'Email', 'Basic Information'),
  row('timezone', 'Timezone', 'Preferences')
];

module.exports = { BASE_USER_FIELD_DEFINITIONS };
