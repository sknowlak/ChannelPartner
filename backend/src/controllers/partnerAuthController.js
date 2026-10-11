const Partner = require('../models/Partner');
const TeamMember = require('../models/TeamMember');
const Role = require('../models/Role');
const { nextId } = require('../utils/idGenerator');
const { hashPassword, verifyPassword, issueToken, passwordProblem } = require('../services/partnerAuthService');
const { logEvent } = require('../services/auditService');
const { ensureDefaultRoles, resolvePermissions } = require('../services/roleService');
const { ensureBaseFields: ensureBaseLeadFields } = require('../services/leadFieldDefinitionService');
const { ensureBaseFields: ensureBaseUserFields } = require('../services/userFieldDefinitionService');
const { generateApiKey } = require('../utils/apiKey');
const { validateMobile } = require('../utils/phone');
const { isValidEmail } = require('../utils/email');

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

// What a login/profile response may carry back to the browser - which
// keeps it in localStorage. The Integrations API key is excluded (it has its
// own MANAGE_SETTINGS-gated endpoint), as is the password-change timestamp.
function toSafeObject(doc) {
  const obj = doc.toObject();
  delete obj.passwordHash;
  delete obj.passwordChangedAt;
  delete obj.apiKey;
  return obj;
}

// Every password change after signup must prove the current password, so a
// stolen session token alone can't be turned into a permanent lockout.
async function applyPasswordChange(account, { password, currentPassword }) {
  if (!currentPassword || !(await verifyPassword(currentPassword, account.passwordHash))) {
    return { status: 400, body: { reason: 'Current password is incorrect', fieldKey: 'currentPassword' } };
  }
  const problem = passwordProblem(password);
  if (problem) return { status: 400, body: { reason: problem, fieldKey: 'password' } };

  account.passwordHash = await hashPassword(password);
  account.passwordChangedAt = new Date();
  return null;
}

// POST /api/channel-partner/partners/register
// Public self-registration. Account is active immediately - "his account
// open and now he can manage his lead" - kycStatus/approvalStatus stay
// PENDING as informational flags for the admin portal, but don't block
// login or lead management, only Partner.status (admin-controlled) does.
async function register(req, res, next) {
  try {
    const { name, mobile, email, username, password, timezone, currency } = req.body;
    if (!name || !mobile || !email || !username || !password) {
      return res.status(400).json({ reason: 'name, mobile, email, username and password are required' });
    }
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ reason: problem, fieldKey: 'password' });
    if (!isValidEmail(email)) return res.status(400).json({ reason: 'Enter a valid email address', fieldKey: 'email' });

    // Usernames share one login namespace across owners and team members
    // (login tries Partner first) - a signup reusing a member's username
    // would silently lock that member out of their account.
    const lowerUsername = String(username).toLowerCase();
    const [existingPartner, existingMember] = await Promise.all([
      Partner.findOne({ username: lowerUsername }),
      TeamMember.findOne({ username: lowerUsername })
    ]);
    if (existingPartner || existingMember) {
      return res.status(409).json({ reason: 'That username is already taken', fieldKey: 'username' });
    }

    const mobileCheck = validateMobile(mobile);
    if (!mobileCheck.valid) return res.status(400).json({ reason: mobileCheck.reason, fieldKey: 'mobile', code: mobileCheck.code });

    const partnerId = await nextId('PARTNER');
    const partnerCode = await nextId('PCODE');

    const partner = new Partner({
      partnerId,
      partnerCode,
      name,
      mobile: mobileCheck.e164,
      email: email.trim(),
      username: lowerUsername,
      passwordHash: await hashPassword(password),
      timezone: timezone || 'UTC',
      currency: currency || 'USD',
      createdBy: 'SELF_REGISTERED',
      status: 'ACTIVE',
      kycStatus: 'PENDING',
      approvalStatus: 'PENDING',
      apiKey: generateApiKey()
    });

    for (const field of SELF_SERVICE_FIELDS) {
      if (req.body[field] !== undefined) partner[field] = req.body[field];
    }

    const superAdminRole = await ensureDefaultRoles(partnerId);
    await ensureBaseLeadFields(partnerId);
    await ensureBaseUserFields(partnerId);
    partner.roleId = superAdminRole.roleId;
    await partner.save();

    await logEvent({
      registrationId: `PARTNER:${partnerId}`,
      eventType: 'PARTNER_SELF_REGISTERED',
      actor: `PARTNER:${username}`,
      newValue: { partnerId, name, username },
      description: `Channel partner ${name} self-registered (${partnerId})`
    });

    const token = issueToken({ partnerId: partner.partnerId, username: partner.username });
    return res.status(201).json({
      token,
      role: 'OWNER',
      roleName: superAdminRole.name,
      permissions: superAdminRole.permissions,
      partner: toSafeObject(partner)
    });
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

    // Password is always checked before account status, so the
    // "deactivated" message can't be used to probe which usernames exist.
    const lowerUsername = String(username).toLowerCase();
    const partner = await Partner.findOne({ username: lowerUsername });

    if (partner) {
      const valid = await verifyPassword(String(password), partner.passwordHash);
      if (!valid) return res.status(401).json({ reason: 'Invalid credentials' });
      if (partner.status !== 'ACTIVE') return res.status(403).json({ reason: 'This partner account is deactivated' });

      partner.lastLoginAt = new Date();
      await partner.save();

      const token = issueToken({ partnerId: partner.partnerId, username: partner.username });
      const permissions = await resolvePermissions({ role: 'OWNER' });
      const superAdminRole = await ensureDefaultRoles(partner.partnerId);
      return res.json({ token, role: 'OWNER', roleName: superAdminRole.name, permissions, partner: toSafeObject(partner) });
    }

    const member = await TeamMember.findOne({ username: lowerUsername });
    if (member) {
      const valid = await verifyPassword(String(password), member.passwordHash);
      if (!valid) return res.status(401).json({ reason: 'Invalid credentials' });
      if (member.status !== 'ACTIVE') return res.status(403).json({ reason: 'This team member account is deactivated' });

      const ownerPartner = await Partner.findOne({ partnerId: member.partnerId });
      if (!ownerPartner || ownerPartner.status !== 'ACTIVE') {
        return res.status(403).json({ reason: 'The parent partner account is deactivated' });
      }

      member.lastLoginAt = new Date();
      await member.save();

      const token = issueToken({ partnerId: member.partnerId, username: member.username });
      const permissions = await resolvePermissions({ role: 'MEMBER', partnerId: member.partnerId, roleId: member.roleId });
      const memberRole = await Role.findOne({ roleId: member.roleId, partnerId: member.partnerId });
      return res.json({ token, role: 'MEMBER', roleName: memberRole?.name || '', permissions, partner: toSafeObject(member) });
    }

    return res.status(401).json({ reason: 'Invalid credentials' });
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/my/profile
// Returns the owner's Partner record, or a team member's own record, plus
// their resolved role name and permissions (section 34).
async function getMyProfile(req, res, next) {
  try {
    if (req.role === 'MEMBER') {
      const member = await TeamMember.findOne({ memberId: req.memberId });
      if (!member) return res.status(404).json({ reason: 'Team member not found' });
      const role = await Role.findOne({ roleId: member.roleId, partnerId: req.partnerId });
      // Currency is an org-wide setting (unlike timezone, which each member
      // picks for themselves) - every member must see the same unit on the
      // same deal, so it's read from the partner record, not the member's own.
      const org = await Partner.findOne({ partnerId: req.partnerId });
      return res.json({
        role: 'MEMBER',
        roleName: role?.name || '',
        permissions: req.permissions,
        profile: { ...toSafeObject(member), currency: org?.currency || 'USD' }
      });
    }

    const partner = await Partner.findOne({ partnerId: req.partnerId });
    if (!partner) return res.status(404).json({ reason: 'Partner not found' });
    const superAdminRole = await ensureDefaultRoles(req.partnerId);
    return res.json({ role: 'OWNER', roleName: superAdminRole.name, permissions: req.permissions, profile: toSafeObject(partner) });
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
      if (password) {
        const failure = await applyPasswordChange(member, req.body);
        if (failure) return res.status(failure.status).json(failure.body);
      }
      if (email !== undefined && email !== '' && !isValidEmail(email)) {
        return res.status(400).json({ reason: 'Enter a valid email address', fieldKey: 'email' });
      }
      if (name !== undefined) member.name = name;
      if (mobile !== undefined) {
        const check = validateMobile(mobile);
        if (!check.valid) return res.status(400).json({ reason: check.reason, fieldKey: 'mobile', code: check.code });
        member.mobile = check.e164;
      }
      if (email !== undefined) member.email = email;
      if (timezone !== undefined) member.timezone = timezone;

      await member.save();
      // A password change revokes every older token, including the one this
      // request came in on - hand back a fresh one so this session continues.
      const token = password ? issueToken({ partnerId: member.partnerId, username: member.username }) : undefined;
      return res.json({ role: 'MEMBER', profile: toSafeObject(member), token });
    }

    const partner = await Partner.findOne({ partnerId: req.partnerId });
    if (!partner) return res.status(404).json({ reason: 'Partner not found' });

    const { name, mobile, email, timezone, currency, password } = req.body;
    if (password) {
      const failure = await applyPasswordChange(partner, req.body);
      if (failure) return res.status(failure.status).json(failure.body);
    }
    if (email !== undefined && !isValidEmail(email)) {
      return res.status(400).json({ reason: 'Enter a valid email address', fieldKey: 'email' });
    }
    if (name !== undefined) partner.name = name;
    if (mobile !== undefined) {
      const check = validateMobile(mobile);
      if (!check.valid) return res.status(400).json({ reason: check.reason, fieldKey: 'mobile', code: check.code });
      partner.mobile = check.e164;
    }
    if (email !== undefined) partner.email = email;
    if (timezone !== undefined) partner.timezone = timezone;
    if (currency !== undefined) partner.currency = currency;
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

    const token = password ? issueToken({ partnerId: partner.partnerId, username: partner.username }) : undefined;
    return res.json({ role: 'OWNER', profile: toSafeObject(partner), token });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ reason: `A partner with this ${field} already exists` });
    }
    next(err);
  }
}

module.exports = { register, login, getMyProfile, updateMyProfile };
