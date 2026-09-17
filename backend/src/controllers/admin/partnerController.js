const Partner = require('../../models/Partner');
const Registration = require('../../models/Registration');
const CommissionEligibility = require('../../models/CommissionEligibility');
const { nextId } = require('../../utils/idGenerator');
const { logEvent, getTimeline } = require('../../services/auditService');
const { hashPassword } = require('../../services/adminAuthService');
const { buildPartnerFilter } = require('../../utils/partnerFilter');

const STANDARD_FIELDS = [
  'name', 'mobile', 'email', 'username',
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

// GET /api/admin/partners?<any standard field>=&createdFrom=&createdTo=&updatedFrom=&updatedTo=&cf_<key>=
async function listPartners(req, res, next) {
  try {
    const filter = buildPartnerFilter(req.query);
    const partners = await Partner.find(filter).select('-passwordHash').sort({ createdAt: -1 });
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
      newValue: { partnerId, name, username },
      description: `Admin created channel partner ${name} (${partnerId})`
    });

    const result = partner.toObject();
    delete result.passwordHash;
    return res.status(201).json(result);
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
    const partner = await Partner.findOne({ partnerId }).select('-passwordHash');
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

    const previousValue = partner.toObject();
    delete previousValue.passwordHash;

    applyStandardFields(partner, req.body);
    for (const field of ADMIN_CONTROLLED_FIELDS) {
      if (req.body[field] !== undefined) partner[field] = req.body[field];
    }
    if (req.body.customFields !== undefined) {
      partner.customFields = { ...partner.customFields, ...req.body.customFields };
    }
    if (req.body.password) {
      partner.passwordHash = await hashPassword(req.body.password);
    }

    await partner.save();

    const newValue = partner.toObject();
    delete newValue.passwordHash;

    await logEvent({
      registrationId: `PARTNER:${partnerId}`,
      eventType: 'ADMIN_PARTNER_UPDATED',
      actor: `ADMIN:${req.admin.email}`,
      previousValue,
      newValue,
      description: `Admin updated partner ${partnerId}`
    });

    return res.json(newValue);
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

module.exports = { listPartners, createPartner, getPartner, updatePartner, getPartnerActivity };
