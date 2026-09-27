// The full set of permissions the app actually enforces (section 34).
// Kept intentionally small and tied to real gated actions - not a
// speculative "everything" list.
const PERMISSIONS = {
  MANAGE_LEADS: 'MANAGE_LEADS',     // create/progress/book leads (viewing the shared pool is never gated)
  MANAGE_TEAM: 'MANAGE_TEAM',       // add/edit/remove/activate team members
  MANAGE_ROLES: 'MANAGE_ROLES',     // create/edit/delete custom roles, assign roles to members
  MANAGE_SETTINGS: 'MANAGE_SETTINGS' // configure the lead form itself: enable/require/add custom fields (section 36)
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

// Seeded once per partner at registration (section 34). System roles are
// immutable (can't edit permissions or delete) so "Super Admin" can never be
// weakened and a partner can never end up with zero manageable roles.
const DEFAULT_ROLES = [
  { name: 'Super Admin', isSystem: true, permissions: ALL_PERMISSIONS },
  { name: 'Admin', isSystem: true, permissions: [PERMISSIONS.MANAGE_LEADS, PERMISSIONS.MANAGE_TEAM] },
  { name: 'Manager', isSystem: true, permissions: [PERMISSIONS.MANAGE_LEADS] }
];

module.exports = { PERMISSIONS, ALL_PERMISSIONS, DEFAULT_ROLES };
