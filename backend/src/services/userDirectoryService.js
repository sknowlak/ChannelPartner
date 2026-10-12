const Partner = require('../models/Partner');
const TeamMember = require('../models/TeamMember');
const Role = require('../models/Role');

// Every user of one partner organisation, in the id space shared by
// Registration.assignedTo and Notification.userId: the account owner
// (userId = partnerId; holds the Super Admin role) plus each team member
// (userId = memberId). Inactive members are included and flagged - callers
// decide whether to offer them (pickers don't) or show them (a lead still
// assigned to someone since deactivated keeps their name) - sections 48/49.
async function loadOrgUsers(partnerId) {
  const [partner, members, roles] = await Promise.all([
    Partner.findOne({ partnerId }),
    TeamMember.find({ partnerId }).sort({ name: 1 }),
    Role.find({ partnerId })
  ]);
  const superAdmin = roles.find((r) => r.isSystem && r.name === 'Super Admin');
  const users = [];
  if (partner) {
    users.push({
      userId: partner.partnerId,
      name: partner.name,
      email: partner.email,
      mobile: partner.mobile,
      timezone: partner.timezone || 'UTC',
      language: partner.language || '',
      roleId: superAdmin?.roleId || '',
      isOwner: true,
      status: 'ACTIVE'
    });
  }
  for (const m of members) {
    users.push({
      userId: m.memberId,
      name: m.name,
      email: m.email || '',
      mobile: m.mobile || '',
      timezone: m.timezone || 'UTC',
      language: m.language || '',
      roleId: m.roleId,
      isOwner: false,
      status: m.status
    });
  }
  return users;
}

// The fields safe to send to the browser (no email/mobile needed there).
function publicUser(u) {
  return { userId: u.userId, name: u.name, isOwner: u.isOwner, status: u.status, roleId: u.roleId };
}

module.exports = { loadOrgUsers, publicUser };
