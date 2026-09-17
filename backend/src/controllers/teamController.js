const TeamMember = require('../models/TeamMember');
const Partner = require('../models/Partner');
const { nextId } = require('../utils/idGenerator');
const { hashPassword } = require('../services/partnerAuthService');
const { logEvent } = require('../services/auditService');

function toSafeObject(doc) {
  const obj = doc.toObject();
  delete obj.passwordHash;
  return obj;
}

// GET /api/channel-partner/my/team
// Readable by the owner and any team member - everyone on the team can see
// the roster, only the owner can change it.
async function listTeam(req, res, next) {
  try {
    const members = await TeamMember.find({ partnerId: req.partnerId }).sort({ createdAt: 1 });
    return res.json({ count: members.length, members: members.map(toSafeObject) });
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

// POST /api/channel-partner/my/team  (owner only)
async function createTeamMember(req, res, next) {
  try {
    const { name, mobile, email, username, password, timezone } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ reason: 'name, username and password are required' });
    }
    if (password.length < 8) return res.status(400).json({ reason: 'Password must be at least 8 characters' });

    const lowerUsername = username.toLowerCase();
    const [existingPartner, existingMember] = await Promise.all([
      Partner.findOne({ username: lowerUsername }),
      TeamMember.findOne({ username: lowerUsername })
    ]);
    if (existingPartner || existingMember) {
      return res.status(409).json({ reason: 'That username is already taken' });
    }

    const memberId = await nextId('TM');
    const member = await TeamMember.create({
      memberId,
      partnerId: req.partnerId,
      name,
      mobile,
      email,
      username: lowerUsername,
      passwordHash: await hashPassword(password),
      timezone: timezone || 'UTC',
      createdBy: req.actorLabel
    });

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'TEAM_MEMBER_ADDED',
      actor: req.actorLabel,
      newValue: { memberId, name, username: lowerUsername },
      description: `Added team member ${name} (${username})`
    });

    return res.status(201).json(toSafeObject(member));
  } catch (err) {
    next(err);
  }
}

// PATCH /api/channel-partner/my/team/:memberId  (owner only)
async function updateTeamMember(req, res, next) {
  try {
    const { memberId } = req.params;
    const member = await TeamMember.findOne({ memberId, partnerId: req.partnerId });
    if (!member) return res.status(404).json({ reason: 'Team member not found' });

    const { name, mobile, email, status, timezone, password } = req.body;
    const previousValue = { name: member.name, status: member.status };

    if (name !== undefined) member.name = name;
    if (mobile !== undefined) member.mobile = mobile;
    if (email !== undefined) member.email = email;
    if (status !== undefined) member.status = status;
    if (timezone !== undefined) member.timezone = timezone;
    if (password) member.passwordHash = await hashPassword(password);

    await member.save();

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'TEAM_MEMBER_UPDATED',
      actor: req.actorLabel,
      previousValue,
      newValue: { name: member.name, status: member.status },
      description: `Updated team member ${member.name} (${member.username})`
    });

    return res.json(toSafeObject(member));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/channel-partner/my/team/:memberId  (owner only)
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
