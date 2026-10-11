const TeamMember = require('../models/TeamMember');
const Partner = require('../models/Partner');
const Role = require('../models/Role');
const { nextId } = require('../utils/idGenerator');
const { hashPassword, passwordProblem } = require('../services/partnerAuthService');
const { PERMISSIONS } = require('../config/permissions');
const { isValidEmail } = require('../utils/email');
const { logEvent } = require('../services/auditService');
const { listFieldDefinitions } = require('../services/userFieldDefinitionService');
const { validateMobile } = require('../utils/phone');

function toSafeObject(doc) {
  const obj = doc.toObject();
  delete obj.passwordHash;
  delete obj.passwordChangedAt;
  return obj;
}

// MANAGE_TEAM lets you manage people at or below your own level, never
// above it: a role is "within reach" only if every permission it carries is
// one the caller already holds. Without this, an Admin (MANAGE_LEADS +
// MANAGE_TEAM) could assign themselves Super Admin, or reset a Super Admin
// member's password and log in as them. The account owner holds everything,
// so this never restricts them.
function roleWithinReach(req, role) {
  return (role?.permissions || []).every((p) => req.permissions.includes(p));
}

async function defaultRoleId(partnerId) {
  const manager = await Role.findOne({ partnerId, name: 'Manager' });
  return manager ? manager.roleId : null;
}

// GET /api/channel-partner/my/team
// Readable by the owner and any team member - everyone on the team can see
// the roster, only someone with MANAGE_TEAM permission can change it.
async function listTeam(req, res, next) {
  try {
    const members = await TeamMember.find({ partnerId: req.partnerId }).sort({ createdAt: 1 });
    const roles = await Role.find({ partnerId: req.partnerId });
    const roleNameById = new Map(roles.map((r) => [r.roleId, r.name]));

    const enriched = members.map((m) => ({ ...toSafeObject(m), roleName: roleNameById.get(m.roleId) || '' }));
    return res.json({ count: enriched.length, members: enriched });
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/my/team/:memberId
// Readable by the owner and any team member, same as the list endpoint -
// backs the standalone edit page (spec section 32).
async function getTeamMember(req, res, next) {
  try {
    const { memberId } = req.params;
    const member = await TeamMember.findOne({ memberId, partnerId: req.partnerId });
    if (!member) return res.status(404).json({ reason: 'Team member not found' });
    return res.json(toSafeObject(member));
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/team  (requires MANAGE_TEAM)
// Validation is dynamic (section 38): whichever fields this partner has
// marked required/enabled in Settings > User are what get checked, not a
// hardcoded list - name/username/password stay required because they're
// core fields nobody can disable.
async function createTeamMember(req, res, next) {
  try {
    const { username, password } = req.body;
    let { roleId } = req.body;

    const fieldDefs = await listFieldDefinitions(req.partnerId);
    for (const def of fieldDefs) {
      if (!def.isEnabled || !def.isRequired) continue;
      const value = req.body[def.fieldKey];
      if (value === undefined || value === null || value === '') {
        return res.status(400).json({ reason: `${def.label} is required`, fieldKey: def.fieldKey });
      }
    }
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ reason: problem, fieldKey: 'password' });
    if (req.body.email && !isValidEmail(req.body.email)) {
      return res.status(400).json({ reason: 'Enter a valid email address', fieldKey: 'email' });
    }

    if (req.body.mobile) {
      const mobileCheck = validateMobile(req.body.mobile);
      if (!mobileCheck.valid) return res.status(400).json({ reason: mobileCheck.reason, fieldKey: 'mobile', code: mobileCheck.code });
      req.body.mobile = mobileCheck.e164;
    }

    if (!roleId) {
      roleId = await defaultRoleId(req.partnerId);
      if (!roleId) return res.status(500).json({ reason: 'No default role configured for this organisation' });
    }
    const role = await Role.findOne({ roleId, partnerId: req.partnerId });
    if (!role) return res.status(400).json({ reason: 'Unknown roleId for this organisation' });
    if (!roleWithinReach(req, role)) {
      return res.status(403).json({ reason: "You can't assign a role with permissions you don't have", fieldKey: 'roleId' });
    }

    const lowerUsername = String(username).toLowerCase();
    const [existingPartner, existingMember] = await Promise.all([
      Partner.findOne({ username: lowerUsername }),
      TeamMember.findOne({ username: lowerUsername })
    ]);
    if (existingPartner || existingMember) {
      return res.status(409).json({ reason: 'That username is already taken' });
    }

    const customFieldValues = {};
    for (const def of fieldDefs) {
      if (def.isCustom && def.isEnabled && req.body[def.fieldKey] !== undefined && req.body[def.fieldKey] !== '') {
        customFieldValues[def.fieldKey] = req.body[def.fieldKey];
      }
    }

    const memberId = await nextId('TM');
    const member = await TeamMember.create({
      memberId,
      partnerId: req.partnerId,
      name: req.body.name,
      mobile: req.body.mobile,
      email: req.body.email,
      username: lowerUsername,
      passwordHash: await hashPassword(password),
      timezone: req.body.timezone || 'UTC',
      roleId,
      createdBy: req.actorLabel,
      customFields: customFieldValues
    });

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'TEAM_MEMBER_ADDED',
      actor: req.actorLabel,
      newValue: { memberId, name: member.name, username: lowerUsername, roleId },
      description: `Added team member ${member.name} (${username})`
    });

    return res.status(201).json(toSafeObject(member));
  } catch (err) {
    next(err);
  }
}

// PATCH /api/channel-partner/my/team/:memberId  (requires MANAGE_TEAM)
async function updateTeamMember(req, res, next) {
  try {
    const { memberId } = req.params;
    const member = await TeamMember.findOne({ memberId, partnerId: req.partnerId });
    if (!member) return res.status(404).json({ reason: 'Team member not found' });

    const { name, mobile, email, status, timezone, password, roleId } = req.body;
    const previousValue = { name: member.name, status: member.status, roleId: member.roleId };

    const currentRole = await Role.findOne({ roleId: member.roleId, partnerId: req.partnerId });
    if (!roleWithinReach(req, currentRole)) {
      return res.status(403).json({ reason: "You can't edit a team member whose role has more permissions than yours" });
    }

    const isSelf = member.memberId === req.memberId;
    if (roleId !== undefined && roleId !== member.roleId) {
      if (isSelf) return res.status(403).json({ reason: "You can't change your own role", fieldKey: 'roleId' });
      if (!req.permissions.includes(PERMISSIONS.MANAGE_ROLES)) {
        return res.status(403).json({ reason: `Changing a member's role needs the "${PERMISSIONS.MANAGE_ROLES}" permission`, fieldKey: 'roleId' });
      }
      const role = await Role.findOne({ roleId, partnerId: req.partnerId });
      if (!role) return res.status(400).json({ reason: 'Unknown roleId for this organisation' });
      if (!roleWithinReach(req, role)) {
        return res.status(403).json({ reason: "You can't assign a role with permissions you don't have", fieldKey: 'roleId' });
      }
      member.roleId = roleId;
    }
    if (status !== undefined && status !== member.status) {
      if (isSelf) return res.status(403).json({ reason: "You can't change your own status", fieldKey: 'status' });
      if (!['ACTIVE', 'INACTIVE'].includes(status)) return res.status(400).json({ reason: 'status must be ACTIVE or INACTIVE', fieldKey: 'status' });
      member.status = status;
    }
    if (email !== undefined && email !== '' && !isValidEmail(email)) {
      return res.status(400).json({ reason: 'Enter a valid email address', fieldKey: 'email' });
    }
    if (password) {
      const problem = passwordProblem(password);
      if (problem) return res.status(400).json({ reason: problem, fieldKey: 'password' });
      member.passwordHash = await hashPassword(password);
      member.passwordChangedAt = new Date(); // logs the member out everywhere
    }
    if (name !== undefined) member.name = name;
    if (mobile !== undefined) {
      if (mobile) {
        const mobileCheck = validateMobile(mobile);
        if (!mobileCheck.valid) return res.status(400).json({ reason: mobileCheck.reason, fieldKey: 'mobile', code: mobileCheck.code });
        member.mobile = mobileCheck.e164;
      } else {
        member.mobile = mobile;
      }
    }
    if (email !== undefined) member.email = email;
    if (timezone !== undefined) member.timezone = timezone;

    const fieldDefs = await listFieldDefinitions(req.partnerId);
    for (const def of fieldDefs) {
      if (def.isCustom && req.body[def.fieldKey] !== undefined) {
        member.customFields = { ...member.customFields, [def.fieldKey]: req.body[def.fieldKey] };
      }
    }

    // Checked against the member's now-updated values (above), so a field
    // is only flagged if it would END UP empty - password/username are
    // exempt: blank password means "keep unchanged" here, and username
    // isn't editable through this form at all.
    for (const def of fieldDefs) {
      if (!def.isEnabled || !def.isRequired || def.fieldKey === 'password' || def.fieldKey === 'username') continue;
      const value = def.isCustom ? member.customFields?.[def.fieldKey] : member[def.fieldKey];
      if (value === undefined || value === null || value === '') {
        return res.status(400).json({ reason: `${def.label} is required`, fieldKey: def.fieldKey });
      }
    }

    await member.save();

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'TEAM_MEMBER_UPDATED',
      actor: req.actorLabel,
      previousValue,
      newValue: { name: member.name, status: member.status, roleId: member.roleId },
      description: `Updated team member ${member.name} (${member.username})`
    });

    return res.json(toSafeObject(member));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/channel-partner/my/team/:memberId  (requires MANAGE_TEAM)
async function deleteTeamMember(req, res, next) {
  try {
    const { memberId } = req.params;
    if (memberId === req.memberId) return res.status(403).json({ reason: "You can't remove yourself" });
    const target = await TeamMember.findOne({ memberId, partnerId: req.partnerId });
    if (!target) return res.status(404).json({ reason: 'Team member not found' });
    const targetRole = await Role.findOne({ roleId: target.roleId, partnerId: req.partnerId });
    if (!roleWithinReach(req, targetRole)) {
      return res.status(403).json({ reason: "You can't remove a team member whose role has more permissions than yours" });
    }

    const member = await TeamMember.findOneAndDelete({ memberId, partnerId: req.partnerId });
    if (!member) return res.status(404).json({ reason: 'Team member not found' });

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'TEAM_MEMBER_REMOVED',
      actor: req.actorLabel,
      previousValue: { memberId, name: member.name, username: member.username },
      description: `Removed team member ${member.name} (${member.username})`
    });

    return res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listTeam, getTeamMember, createTeamMember, updateTeamMember, deleteTeamMember };
