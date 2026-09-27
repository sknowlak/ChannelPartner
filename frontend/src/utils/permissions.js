// Mirrors backend/src/config/permissions.js - kept as plain string constants
// (not fetched from the API) since they're a fixed, small set tied to
// actual gated actions in this app (sections 34, 36).
export const PERMISSIONS = {
  MANAGE_LEADS: 'MANAGE_LEADS',
  MANAGE_TEAM: 'MANAGE_TEAM',
  MANAGE_ROLES: 'MANAGE_ROLES',
  MANAGE_SETTINGS: 'MANAGE_SETTINGS'
};

export const PERMISSION_LABELS = {
  MANAGE_LEADS: 'Manage Leads (create, progress, book)',
  MANAGE_TEAM: 'Manage Team (add, edit, remove members)',
  MANAGE_ROLES: 'Manage Roles & Permissions',
  MANAGE_SETTINGS: 'Manage Settings (lead form fields)'
};
