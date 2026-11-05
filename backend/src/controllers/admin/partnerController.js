const Partner = require('../../models/Partner');
const TeamMember = require('../../models/TeamMember');
const Registration = require('../../models/Registration');
const CommissionEligibility = require('../../models/CommissionEligibility');
const { nextId } = require('../../utils/idGenerator');
const { logEvent, getTimeline } = require('../../services/auditService');
const { hashPassword, passwordProblem } = require('../../services/partnerAuthService');
const { buildPartnerFilter } = require('../../utils/partnerFilter');
const { validateMobile } = require('../../utils/phone');

// `username` is deliberately not in this list - it is the partner's login
// name, so it is normalised and checked for collisions separately
// (usernameProblem below) instead of being copied over as-is.
const STANDARD_FIELDS = [
  'name', 'mobile', 'email',
  'partnerType', 'companyName', 'contactPersonName', 'alternateMobile', 'alternateEmail', 'website',
  'address', 'addressLine2', 'city', 'state', 'country', 'pinCode',
  'panNumber', 'gstin', 'reraRegistrationNumber', 'reraState', 'reraExpiryDate',
  'panDocumentUrl', 'gstCertificateUrl', 'reraCertificateUrl', 'addressProofUrl',
  'bankAccountHolderName', 'bankName', 'accountNumber', 'ifscCode', 'accountType',
  'partnerSource', 'referredBy', 'relationshipManager', 'partnerCategory',
  'operatingCities', 'operatingStates', 'yearsOfExperience', 'numberOfSalesAgents',
  'crmName', 'externalPartnerId', 'integrationType',
  'agreementNumber', 'agreementStartDate', 'agreementExpiryDate',
  'commissionPlan', 'commissionType', 'commissionRate',
  'notes'
];

// Admin-only fields the caller may also set explicitly (unlike the fields
// above, these are system-controlled and not part of a partner self-entry
// form, but the admin portal is allowed to set them directly).
const ADMIN_CONTROLLED_FIELDS = ['status', 'kycStatus', 'approvalStatus'];

function applyStandardFields(target, body) {
  for (const field of STANDARD_FIELDS) {
    if (body[field] !== undefined) target[field] = body[field];
  }
}

// Never sent to the admin portal: credentials and the session-revocation
// timestamp (apiKey is the legacy plaintext key, apiKeyHash its digest).
const SECRET_FIELDS = ['passwordHash', 'passwordChangedAt', 'apiKey', 'apiKeyHash'];
const SAFE_PROJECTION = SECRET_FIELDS.map((f) => `-${f}`).join(' ');

// "XXXXXX1234" - enough to recognise an account without exposing it.
function maskAccountNumber(value) {
  if (!value) return value;
  const text = String(value);
  return text.length <= 4 ? 'X'.repeat(text.length) : `${'X'.repeat(text.length - 4)}${text.slice(-4)}`;
}

function stripSecrets(obj) {
  for (const field of SECRET_FIELDS) delete obj[field];
  return obj;
}

// What the ADMIN_PARTNER_UPDATED audit row keeps of the partner: no
// credentials, and the bank account number masked - the audit trail is
// readable by every admin and is kept indefinitely.
function auditSnapshot(doc) {
  const obj = stripSecrets(doc.toObject());
  if (obj.accountNumber) obj.accountNumber = maskAccountNumber(obj.accountNumber);
  return obj;
}

// Usernames share one login namespace across partners (owners) and team
// members (login tries Partner first, then TeamMember), so a username must
// be free in BOTH collections - otherwise an admin could silently shadow a
// team member's login. Returns { username } or { status, body }.
async function usernameProblem(raw, exceptPartnerId = null) {
  const username = String(raw ?? '').trim().toLowerCase();
  if (!username) return { status: 400, body: { reason: 'username is required', fieldKey: 'username' } };
  const partnerFilter = { username };
  if (exceptPartnerId) partnerFilter.partnerId = { $ne: exceptPartnerId };
  const [partner, member] = await Promise.all([Partner.exists(partnerFilter), TeamMember.exists({ username })]);
  if (partner || member) return { status: 409, body: { reason: 'That username is already taken', fieldKey: 'username' } };
  return { username };
}

// GET /api/admin/partners?<any standard field>=&createdFrom=&createdTo=&updatedFrom=&updatedTo=&cf_<key>=
async function listPartners(req, res, next) {
  try {
    const filter = buildPartnerFilter(req.query);
    // The list is a roster: secrets are projected out and bank account
    // numbers masked (the full number is only on the single-partner view,
    // whose edit form needs it to save the record back unchanged).
    const partners = await Partner.find(filter).select(SAFE_PROJECTION).sort({ createdAt: -1 }).lean();
    for (const p of partners) if (p.accountNumber) p.accountNumber = maskAccountNumber(p.accountNumber);
    return res.json({ count: partners.length, partners });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/partners
async function createPartner(req, res, next) {
  try {
    const { name, mobile, email, username, password, customFields } = req.body;
    if (!name || !mobile || !email || !username || !password) {
      return res.status(400).json({ reason: 'name, mobile, email, username and password are required' });
    }
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ reason: problem, fieldKey: 'password' });
    const mobileCheck = validateMobile(mobile);
    if (!mobileCheck.valid) return res.status(400).json({ reason: mobileCheck.reason, fieldKey: 'mobile', code: mobileCheck.code });
    const nameCheck = await usernameProblem(username);
    if (nameCheck.status) return res.status(nameCheck.status).json(nameCheck.body);

    const partnerId = await nextId('PARTNER');
    const partnerCode = await nextId('PCODE');

    const partner = new Partner({
      partnerId,
      partnerCode,
      name,
      mobile: mobileCheck.e164,
      email,
      username: nameCheck.username,
      passwordHash: await hashPassword(password),
      customFields: customFields || {},
      createdBy: `ADMIN:${req.admin.email}`
    });

    applyStandardFields(partner, req.body);
    for (const field of ADMIN_CONTROLLED_FIELDS) {
      if (req.body[field] !== undefined) partner[field] = req.body[field];
    }

    await partner.save();

    await logEvent({
      registrationId: `PARTNER:${partnerId}`,
      eventType: 'ADMIN_PARTNER_CREATED',
      actor: `ADMIN:${req.admin.email}`,
      newValue: { partnerId, name, username: nameCheck.username },
      description: `Admin created channel partner ${name} (${partnerId})`
    });

    return res.status(201).json(stripSecrets(partner.toObject()));
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ reason: `A partner with this ${field} already exists` });
    }
    next(err);
  }
}

// GET /api/admin/partners/:partnerId
async function getPartner(req, res, next) {
  try {
    const { partnerId } = req.params;
    const partner = await Partner.findOne({ partnerId }).select(SAFE_PROJECTION);
    if (!partner) return res.status(404).json({ reason: 'Partner not found' });

    const registrations = await Registration.find({ partnerId }).sort({ registeredAt: -1 });
    const commissions = await CommissionEligibility.find({ partnerId });

    return res.json({
      partner,
      registrations,
      commissionSummary: {
        total: commissions.length,
        eligible: commissions.filter((c) => c.eligibilityStatus === 'ELIGIBLE').length
      }
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/partners/:partnerId
async function updatePartner(req, res, next) {
  try {
    const { partnerId } = req.params;
    const partner = await Partner.findOne({ partnerId });
    if (!partner) return res.status(404).json({ reason: 'Partner not found' });

    const previousValue = auditSnapshot(partner);

    // Changing a partner's login credentials (password or username) lets the
    // admin sign in as that partner, so it is Super Admin only. The route
    // gates `password` too (adminRoutes.js); the edit form always re-sends
    // the username, so only an actual change of it is gated.
    let newUsername = null;
    if (req.body.username !== undefined && String(req.body.username).trim().toLowerCase() !== partner.username) {
      if (req.admin?.role !== 'SUPER_ADMIN') return res.status(403).json({ reason: "Only a Super Admin can change a partner's username", fieldKey: 'username' });
      const nameCheck = await usernameProblem(req.body.username, partnerId);
      if (nameCheck.status) return res.status(nameCheck.status).json(nameCheck.body);
      newUsername = nameCheck.username;
    }
    if (req.body.password) {
      if (req.admin?.role !== 'SUPER_ADMIN') return res.status(403).json({ reason: "Only a Super Admin can reset a partner's password", fieldKey: 'password' });
      const problem = passwordProblem(req.body.password);
      if (problem) return res.status(400).json({ reason: problem, fieldKey: 'password' });
    }

    if (req.body.mobile !== undefined) {
      const mobileCheck = validateMobile(req.body.mobile);
      if (!mobileCheck.valid) return res.status(400).json({ reason: mobileCheck.reason, fieldKey: 'mobile', code: mobileCheck.code });
      req.body.mobile = mobileCheck.e164;
    }

    applyStandardFields(partner, req.body);
    for (const field of ADMIN_CONTROLLED_FIELDS) {
      if (req.body[field] !== undefined) partner[field] = req.body[field];
    }
    if (req.body.customFields !== undefined) {
      partner.customFields = { ...partner.customFields, ...req.body.customFields };
    }
    if (newUsername) partner.username = newUsername;
    if (req.body.password) {
      partner.passwordHash = await hashPassword(req.body.password);
      partner.passwordChangedAt = new Date(); // signs the partner out everywhere
    }

    await partner.save();

    const newValue = auditSnapshot(partner);

    await logEvent({
      registrationId: `PARTNER:${partnerId}`,
      eventType: 'ADMIN_PARTNER_UPDATED',
      actor: `ADMIN:${req.admin.email}`,
      previousValue,
      newValue: { ...newValue, ...(req.body.password ? { passwordReset: true } : {}) },
      description: `Admin updated partner ${partnerId}`
    });

    return res.json(stripSecrets(partner.toObject()));
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({ reason: `A partner with this ${field} already exists` });
    }
    next(err);
  }
}

// GET /api/admin/partners/:partnerId/activity
async function getPartnerActivity(req, res, next) {
  try {
    const { partnerId } = req.params;
    const events = await getTimeline(`PARTNER:${partnerId}`);
    return res.json({ events });
  } catch (err) {
    next(err);
  }
}

module.exports = { listPartners, createPartner, getPartner, updatePartner, getPartnerActivity, maskAccountNumber };
