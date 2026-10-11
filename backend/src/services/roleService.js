const Role = require('../models/Role');
const TeamMember = require('../models/TeamMember');
const Partner = require('../models/Partner');
const { nextId } = require('../utils/idGenerator');
const { DEFAULT_ROLES, ALL_PERMISSIONS } = require('../config/permissions');

// Seeds Super Admin/Admin/Manager for a newly-registered partner and returns
// the Super Admin role so the caller can assign it to the owner immediately.
async function ensureDefaultRoles(partnerId) {
  const existing = await Role.find({ partnerId, isSystem: true });
  if (existing.length >= DEFAULT_ROLES.length) {
    return existing.find((r) => r.name === 'Super Admin');
  }

  const created = [];
  for (const template of DEFAULT_ROLES) {
    const already = existing.find((r) => r.name === template.name);
    if (already) {
      created.push(already);
      continue;
    }
    const roleId = await nextId('ROLE');
    const role = await Role.create({ roleId, partnerId, ...template });
    created.push(role);
  }
  return created.find((r) => r.name === 'Super Admin');
}

async function listRoles(partnerId) {
  return Role.find({ partnerId }).sort({ isSystem: -1, name: 1 });
}

// MANAGE_ROLES is not a master key: `actor` ({ roleId, permissions } of
// the caller) may only hand out permissions it already holds, and may never
// edit the role it is itself assigned - otherwise a member whose custom role
// has just MANAGE_ROLES could grant that role every permission.
function permissionsBeyond(actor, permissions) {
  return (permissions || []).filter((p) => !actor.permissions.includes(p));
}

async function createCustomRole(partnerId, { name, permissions }, actor) {
  const validPermissions = (Array.isArray(permissions) ? permissions : []).filter((p) => ALL_PERMISSIONS.includes(p));
  const beyond = permissionsBeyond(actor, validPermissions);
  if (beyond.length) return { error: `You can't grant permissions you don't have: ${beyond.join(', ')}` };

  const roleId = await nextId('ROLE');
  const role = await Role.create({ roleId, partnerId, name, isSystem: false, permissions: validPermissions });
  return { role };
}

async function updateCustomRole(partnerId, roleId, { name, permissions }, actor) {
  const role = await Role.findOne({ roleId, partnerId });
  if (!role) return { error: 'Role not found' };
  if (role.isSystem) return { error: 'System roles cannot be edited' };
  if (actor.roleId && actor.roleId === roleId) return { error: "You can't edit your own role" };
  if (permissionsBeyond(actor, role.permissions).length) {
    return { error: "You can't edit a role that has permissions you don't have" };
  }

  if (name !== undefined) role.name = name;
  if (permissions !== undefined) {
    const validPermissions = (Array.isArray(permissions) ? permissions : []).filter((p) => ALL_PERMISSIONS.includes(p));
    const beyond = permissionsBeyond(actor, validPermissions);
    if (beyond.length) return { error: `You can't grant permissions you don't have: ${beyond.join(', ')}` };
    role.permissions = validPermissions;
  }
  await role.save();
  return { role };
}

async function deleteCustomRole(partnerId, roleId, actor) {
  const role = await Role.findOne({ roleId, partnerId });
  if (!role) return { error: 'Role not found' };
  if (role.isSystem) return { error: 'System roles cannot be deleted' };
  if (permissionsBeyond(actor, role.permissions).length) {
    return { error: "You can't delete a role that has permissions you don't have" };
  }

  const inUse = await TeamMember.countDocuments({ partnerId, roleId });
  if (inUse > 0) return { error: `${inUse} team member(s) currently have this role - reassign them first` };

  await Role.deleteOne({ roleId, partnerId });
  return { deleted: true };
}

// Resolves what a session can do: the account owner always gets every
// permission unconditionally (never dependent on a DB lookup succeeding),
// a team member's permissions come from their assigned role.
async function resolvePermissions({ role, partnerId, roleId }) {
  if (role === 'OWNER') return ALL_PERMISSIONS;
  if (!roleId) return [];
  const roleDoc = await Role.findOne({ roleId, partnerId });
  return roleDoc ? roleDoc.permissions : [];
}

async function getOwnerRoleName(partnerId) {
  const partner = await Partner.findOne({ partnerId });
  if (!partner || !partner.roleId) return 'Super Admin';
  const role = await Role.findOne({ roleId: partner.roleId, partnerId });
  return role ? role.name : 'Super Admin';
}

module.exports = {
  ensureDefaultRoles,
  listRoles,
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
  resolvePermissions,
  getOwnerRoleName
};
