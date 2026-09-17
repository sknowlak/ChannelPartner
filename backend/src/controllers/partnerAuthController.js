const Partner = require('../models/Partner');
const TeamMember = require('../models/TeamMember');
const { nextId } = require('../utils/idGenerator');
const { hashPassword, verifyPassword, issueToken } = require('../services/partnerAuthService');
const { logEvent } = require('../services/auditService');

// Fields a partner may set about themselves during self-registration or a
// later profile update. Deliberately excludes admin/builder-controlled
// business terms (commissionPlan/Type/Rate, relationshipManager, agreement
// details, crmName/integrationType, notes) - those stay admin-only (section 30).
const SELF_SERVICE_FIELDS = [
  'partnerType', 'companyName', 'contactPersonName', 'alternateMobile', 'alternateEmail', 'website',
  'address', 'addressLine2', 'city', 'state', 'country', 'pinCode',
  'panNumber', 'gstin', 'reraRegistrationNumber', 'reraState', 'reraExpiryDate',
  'bankAccountHolderName', 'bankName', 'accountNumber', 'ifscCode', 'accountType',
  'partnerCategory', 'operatingCities', 'operatingStates', 'yearsOfExperience', 'numberOfSalesAgents'
];

function toSafeObject(doc) {
  const obj = doc.toObject();
  delete obj.passwordHash;
  return obj;
}

// POST /api/channel-partner/partners/register
// Public self-registration. Account is active immediately - "his account
// open and now he can manage his lead" - kycStatus/approvalStatus stay
// PENDING as informational flags for the admin portal, but don't block
// login or lead management, only Partner.status (admin-controlled) does.
async function register(req, res, next) {
  try {
    const { name, mobile, email, username, password, timezone } = req.body;
    if (!name || !mobile || !email || !username || !password) {
      return res.status(400).json({ reason: 'name, mobile, email, username and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ reason: 'Password must be at least 8 characters' });
    }

    const partnerId = await nextId('PARTNER');
    const partnerCode = await nextId('PCODE');

    const partner = new Partner({
      partnerId,
      partnerCode,
      name,
      mobile,
      email,
      username: username.toLowerCase(),
      passwordHash: await hashPassword(password),
      timezone: timezone || 'UTC',
      createdBy: 'SELF_REGISTERED',
      status: 'ACTIVE',
      kycStatus: 'PENDING',
      approvalStatus: 'PENDING'
    });

    for (const field of SELF_SERVICE_FIELDS) {
      if (req.body[field] !== undefined) partner[field] = req.body[field];
    }

    await partner.save();

    await logEvent({
      registrationId: `PARTNER:${partnerId}`,
      eventType: 'PARTNER_SELF_REGISTERED',
      actor: `PARTNER:${username}`,
      newValue: { partnerId, name, username },
      description: `Channel partner ${name} self-registered (${partnerId})`
    });

    const token = issueToken({ partnerId: partner.partnerId, username: partner.username });
    return res.status(201).json({ token, role: 'OWNER', partner: toSafeObject(partner) });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ reason: `A partner with this ${field} already exists` });
    }
    next(err);
  }
}

// POST /api/channel-partner/partners/login
// Shared login for both the partner (account owner) and any team member
// added under them (section 32) - whichever collection the username
// matches, the caller gets a session scoped to the same partnerId.
async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ reason: 'username and password are required' });

    const lowerUsername = username.toLowerCase();
    const partner = await Partner.findOne({ username: lowerUsername });

    if (partner) {
      if (partner.status !== 'ACTIVE') return res.status(403).json({ reason: 'This partner account is deactivated' });
      const valid = await verifyPassword(password, partner.passwordHash);
      if (!valid) return res.status(401).json({ reason: 'Invalid credentials' });

      partner.lastLoginAt = new Date();
      await partner.save();

      const token = issueToken({ partnerId: partner.partnerId, username: partner.username });
      return res.json({ token, role: 'OWNER', partner: toSafeObject(partner) });
    }

    const member = await TeamMember.findOne({ username: lowerUsername });
    if (member) {
      if (member.status !== 'ACTIVE') return res.status(403).json({ reason: 'This team member account is deactivated' });
      const valid = await verifyPassword(password, member.passwordHash);
      if (!valid) return res.status(401).json({ reason: 'Invalid credentials' });

      const ownerPartner = await Partner.findOne({ partnerId: member.partnerId });
      if (!ownerPartner || ownerPartner.status !== 'ACTIVE') {
        return res.status(403).json({ reason: 'The parent partner account is deactivated' });
      }

      member.lastLoginAt = new Date();
      await member.save();

      const token = issueToken({ partnerId: member.partnerId, username: member.username });
      return res.json({ token, role: 'MEMBER', partner: toSafeObject(member) });
    }

    return res.status(401).json({ reason: 'Invalid credentials' });
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/my/profile
// Returns the owner's Partner record, or a team member's own record.
async function getMyProfile(req, res, next) {
  try {
    if (req.role === 'MEMBER') {
      const member = await TeamMember.findOne({ memberId: req.memberId });
      if (!member) return res.status(404).json({ reason: 'Team member not found' });
      return res.json({ role: 'MEMBER', profile: toSafeObject(member) });
    }

    const partner = await Partner.findOne({ partnerId: req.partnerId });
    if (!partner) return res.status(404).json({ reason: 'Partner not found' });
    return res.json({ role: 'OWNER', profile: toSafeObject(partner) });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/channel-partner/my/profile
// The owner may update the full org profile (see SELF_SERVICE_FIELDS); a
// team member may only update their own small set of personal fields.
async function updateMyProfile(req, res, next) {
  try {
    if (req.role === 'MEMBER') {
      const member = await TeamMember.findOne({ memberId: req.memberId });
      if (!member) return res.status(404).json({ reason: 'Team member not found' });

      const { name, mobile, email, timezone, password } = req.body;
      if (name !== undefined) member.name = name;
      if (mobile !== undefined) member.mobile = mobile;
      if (email !== undefined) member.email = email;
      if (timezone !== undefined) member.timezone = timezone;
      if (password) member.passwordHash = await hashPassword(password);

      await member.save();
      return res.json({ role: 'MEMBER', profile: toSafeObject(member) });
    }

    const partner = await Partner.findOne({ partnerId: req.partnerId });
    if (!partner) return res.status(404).json({ reason: 'Partner not found' });

    const { name, mobile, email, timezone, password } = req.body;
    if (name !== undefined) partner.name = name;
    if (mobile !== undefined) partner.mobile = mobile;
    if (email !== undefined) partner.email = email;
    if (timezone !== undefined) partner.timezone = timezone;
    if (password) partner.passwordHash = await hashPassword(password);
    for (const field of SELF_SERVICE_FIELDS) {
      if (req.body[field] !== undefined) partner[field] = req.body[field];
    }

    await partner.save();

    await logEvent({
      registrationId: `PARTNER:${req.partnerId}`,
      eventType: 'PARTNER_PROFILE_UPDATED',
      actor: req.actorLabel,
      description: 'Partner updated their own profile'
    });

    return res.json({ role: 'OWNER', profile: toSafeObject(partner) });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ reason: `A partner with this ${field} already exists` });
    }
    next(err);
  }
}

module.exports = { register, login, getMyProfile, updateMyProfile };
