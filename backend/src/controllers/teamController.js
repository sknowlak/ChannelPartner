const TeamMember = require('../models/TeamMember');
const Partner = require('../models/Partner');
const Role = require('../models/Role');
const { nextId } = require('../utils/idGenerator');
const { hashPassword } = require('../services/partnerAuthService');
const { logEvent } = require('../services/auditService');
const { listFieldDefinitions } = require('../services/userFieldDefinitionService');
const { validateMobile } = require('../utils/phone');

function toSafeObject(doc) {
  const obj = doc.toObject();
  delete obj.passwordHash;
  return obj;
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
    if (password.length < 8) return res.status(400).json({ reason: 'Password must be at least 8 characters', fieldKey: 'password' });

    if (req.body.mobile) {
      const mobileCheck = validateMobile(req.body.mobile);
      if (!mobileCheck.valid) return res.status(400).json({ reason: mobileCheck.reason, fieldKey: 'mobile', code: mobileCheck.code });
      req.body.mobile = mobileCheck.e164;
    }

    if (roleId) {
      const role = await Role.findOne({ roleId, partnerId: req.partnerId });
      if (!role) return res.status(400).json({ reason: 'Unknown roleId for this organisation' });
    } else {
      roleId = await defaultRoleId(req.partnerId);
      if (!roleId) return res.status(500).json({ reason: 'No default role configured for this organisation' });
    }

    const lowerUsername = username.toLowerCase();
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

    if (roleId !== undefined) {
      const role = await Role.findOne({ roleId, partnerId: req.partnerId });
      if (!role) return res.status(400).json({ reason: 'Unknown roleId for this organisation' });
      member.roleId = roleId;
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
    if (status !== undefined) member.status = status;
    if (timezone !== undefined) member.timezone = timezone;
    if (password) member.passwordHash = await hashPassword(password);

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
