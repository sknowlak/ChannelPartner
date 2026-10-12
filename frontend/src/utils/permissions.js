import i18n from 'i18next';

// Mirrors backend/src/config/permissions.js - kept as plain string constants
// (not fetched from the API) since they're a fixed, small set tied to
// actual gated actions in this app (sections 34, 36).
export const PERMISSIONS = {
  MANAGE_LEADS: 'MANAGE_LEADS',
  MANAGE_TEAM: 'MANAGE_TEAM',
  MANAGE_ROLES: 'MANAGE_ROLES',
  MANAGE_SETTINGS: 'MANAGE_SETTINGS'
};

// Labels live in the 'team' namespace (team:permissions.*) so they follow
// the UI language. Call permissionLabel() at render time - never cache the
// result in a module-level constant.
export function permissionLabel(permission) {
  return i18n.t(`team:permissions.${permission}`, { defaultValue: permission });
}

// Backward-compatible map: each property is a getter, so reading
// PERMISSION_LABELS[perm] always returns the label in the current language.
export const PERMISSION_LABELS = Object.defineProperties({}, Object.fromEntries(
  Object.keys(PERMISSIONS).map((perm) => [perm, { enumerable: true, get: () => permissionLabel(perm) }])
));
