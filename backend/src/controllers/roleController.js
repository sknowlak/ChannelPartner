const TeamMember = require('../models/TeamMember');
const { listRoles, createCustomRole, updateCustomRole, deleteCustomRole } = require('../services/roleService');
const { ALL_PERMISSIONS } = require('../config/permissions');
const { logEvent } = require('../services/auditService');

function actorOf(req) {
  return { roleId: req.roleId, permissions: req.permissions };
}

// GET /api/channel-partner/my/roles
// Readable by the whole team (needed to populate role pickers and to show
// "who has what role"), same visibility as the team roster itself.
async function list(req, res, next) {
  try {
    const roles = await listRoles(req.partnerId);
    const memberCounts = await TeamMember.aggregate([
      { $match: { partnerId: req.partnerId } },
      { $group: { _id: '$roleId', count: { $sum: 1 } } }
    ]);
    const countByRoleId = new Map(memberCounts.map((m) => [m._id, m.count]));

    return res.json({
      availablePermissions: ALL_PERMISSIONS,
      roles: roles.map((r) => ({ ...r.toObject(), memberCount: countByRoleId.get(r.roleId) || 0 }))
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/roles  (requires MANAGE_ROLES)
async function create(req, res, next) {
  try {
    const { name, permissions } = req.body;
    if (!name) return res.status(400).json({ reason: 'name is required' });

    const { role, error } = await createCustomRole(req.partnerId, { name, permissions }, actorOf(req));
    if (error) return res.status(403).json({ reason: error });

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'ROLE_CREATED',
      actor: req.actorLabel,
      newValue: { roleId: role.roleId, name: role.name, permissions: role.permissions },
      description: `Created custom role "${role.name}"`
    });

    return res.status(201).json(role);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ reason: 'A role with this name already exists' });
    next(err);
  }
}

// PATCH /api/channel-partner/my/roles/:roleId  (requires MANAGE_ROLES)
async function update(req, res, next) {
  try {
    const { roleId } = req.params;
    const { name, permissions } = req.body;
    const { role, error } = await updateCustomRole(req.partnerId, roleId, { name, permissions }, actorOf(req));
    if (error) return res.status(400).json({ reason: error });

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'ROLE_UPDATED',
      actor: req.actorLabel,
      newValue: { roleId: role.roleId, name: role.name, permissions: role.permissions },
      description: `Updated role "${role.name}"`
    });

    return res.json(role);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/channel-partner/my/roles/:roleId  (requires MANAGE_ROLES)
async function remove(req, res, next) {
  try {
    const { roleId } = req.params;
    const result = await deleteCustomRole(req.partnerId, roleId, actorOf(req));
    if (result.error) return res.status(400).json({ reason: result.error });

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'ROLE_DELETED',
      actor: req.actorLabel,
      description: `Deleted role ${roleId}`
    });

    return res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
