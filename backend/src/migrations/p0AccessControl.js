const Partner = require('../models/Partner');
const Registration = require('../models/Registration');
const Customer = require('../models/Customer');
const AuditEvent = require('../models/AuditEvent');
const Project = require('../models/Project');
const { apiKeyFields } = require('../utils/apiKey');

// One-time data changes for section 52, run at startup. Every step only
// touches records that still need it, so running again is a no-op.

// 1. Plaintext integration keys -> hash + prefix. Existing keys keep working.
async function hashLegacyApiKeys() {
  const partners = await Partner.find({ apiKey: { $exists: true, $ne: null } });
  for (const p of partners) {
    const fields = apiKeyFields(p.apiKey);
    await Partner.updateOne({ _id: p._id }, { $set: { ...fields, apiKeyCreatedAt: p.updatedAt || fields.apiKeyCreatedAt }, $unset: { apiKey: 1 } });
  }
  return partners.length;
}

// What the partner actually typed when registering, from the history entry
// createMyRegistration writes ({ changes: [{ fieldKey, value }] }).
async function enteredContact(registrationId) {
  const ev = await AuditEvent.findOne({ registrationId, eventType: 'REGISTRATION_RECEIVED' });
  const out = {};
  for (const c of ev?.newValue?.changes || []) {
    if (['name', 'email', 'alternateMobile'].includes(c.fieldKey) && typeof c.value === 'string') out[c.fieldKey] = c.value;
  }
  return out;
}

// 2. Give every registration its own contact copy. Contact details used to
// live only on the Customer record shared by everyone with that phone
// number. The partner who created that record gets a full copy; any other
// partner gets the number (which they entered themselves) plus whatever
// their own registration history shows they typed - never the first
// partner's name or email.
async function backfillContacts() {
  const regs = await Registration.find({ $or: [{ 'contact.mobile': { $exists: false } }, { 'contact.mobile': '' }] }).sort({ registeredAt: 1 });
  let filled = 0;
  for (const reg of regs) {
    const customer = await Customer.findOne({ customerId: reg.customerId });
    if (!customer) continue;
    const first = await Registration.findOne({ customerId: reg.customerId }).sort({ registeredAt: 1 }).select('registrationId partnerId');
    const isCreator = first && first.partnerId === reg.partnerId;
    const typed = await enteredContact(reg.registrationId);
    reg.contact = isCreator
      ? { name: customer.name, mobile: customer.mobile, email: customer.email || '', alternateMobile: customer.alternateMobile || '' }
      : { name: typed.name || '', mobile: customer.mobile, email: typed.email || '', alternateMobile: typed.alternateMobile || '' };
    await reg.save();
    filled += 1;
  }
  return filled;
}

// 3. Referral status for leads created before builders/projects existed.
async function backfillReferralStatus() {
  const regs = await Registration.find({ referralStatus: { $exists: false } }).select('registrationId projectId isBooked');
  const known = new Set((await Project.find().select('projectId')).map((p) => p.projectId));
  for (const reg of regs) {
    let status = 'NOT_REFERRED';
    if (reg.isBooked) status = 'ACCEPTED';
    else if (reg.projectId && known.has(reg.projectId)) status = 'PENDING_BUILDER';
    await Registration.updateOne({ _id: reg._id }, { $set: { referralStatus: status } });
  }
  return regs.length;
}

async function runP0Migrations() {
  const keys = await hashLegacyApiKeys();
  // Referral status first: saving a registration in backfillContacts would
  // otherwise store the schema default before this step could decide it.
  const referrals = await backfillReferralStatus();
  const contacts = await backfillContacts();
  if (keys || contacts || referrals) {
    console.log(`[migrations] section 52: hashed ${keys} API key(s), backfilled ${contacts} contact copies, set ${referrals} referral status(es)`);
  }
}

module.exports = { runP0Migrations };
