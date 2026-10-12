const Customer = require('../models/Customer');
const Registration = require('../models/Registration');
const RegistrationClaim = require('../models/RegistrationClaim');
const { getSettings } = require('./settingsService');
const { normalizeMobile } = require('../utils/phone');
const { normalizeEmail } = require('../utils/email');
const { nextId } = require('../utils/idGenerator');

// Finds an ACTIVE (still-protected) registration of the same person for the
// same project (spec section 7), matching on the normalized keys each
// registration keeps of its own contact details (section 52) - primary and
// alternate numbers are checked against both, emails ignore case, spaces
// and +tags. Matches regardless of which partner holds it: ownership must
// never be silently overwritten, even by the same partner re-registering.
// `excludeRegistrationId` lets an edit of an existing lead ask "would this
// collide with anyone else?".
async function findDuplicate({ mobile, email, alternateMobile, projectId, excludeRegistrationId }) {
  projectId = String(projectId || ''); // leads with no project attached (section 33) share the '' bucket
  const { duplicateMatchFields } = await getSettings();
  const keys = [];

  if (duplicateMatchFields.includes('mobile')) {
    for (const number of [mobile, alternateMobile]) {
      if (!number) continue;
      const key = normalizeMobile(String(number));
      if (key) keys.push({ 'match.mobile': key }, { 'match.alternateMobile': key });
    }
  }
  if (duplicateMatchFields.includes('email') && email) {
    const key = normalizeEmail(String(email));
    if (key) keys.push({ 'match.email': key });
  }
  if (keys.length === 0) return null;

  const filter = { $or: keys, projectId, status: 'ACCEPTED', protectionExpiry: { $gt: new Date() } };
  if (excludeRegistrationId) filter.registrationId = { $ne: excludeRegistrationId };
  return Registration.findOne(filter).sort({ registeredAt: -1 });
}

// One Customer per real phone number. Concurrent first registrations of the
// same number both miss the lookup; the unique index on mobileNormalized
// rejects the second create, which then just uses the first one's record.
async function findOrCreateCustomer({ name, mobile, email, alternateMobile }) {
  const key = normalizeMobile(mobile);
  const existing = await Customer.findOne({ mobileNormalized: key });
  if (existing) return existing;
  try {
    return await Customer.create({ customerId: await nextId('CUST'), name, mobile, email, alternateMobile });
  } catch (err) {
    if (err.code !== 11000) throw err;
    return Customer.findOne({ mobileNormalized: key });
  }
}

// Atomically takes protection of customer + project for a new registration.
// Succeeds when nobody holds it, or the current holder's protection has
// expired; otherwise the unique key makes the upsert fail and the caller
// gets the current holder back. Returns { claimed: true } or
// { claimed: false, holder }.
async function claimProtection({ customerId, projectId, registrationId, partnerId, expiresAt }) {
  const key = `${customerId}|${projectId || ''}`;
  try {
    await RegistrationClaim.findOneAndUpdate(
      { key, expiresAt: { $lte: new Date() } },
      { $set: { registrationId, partnerId, expiresAt } },
      { upsert: true, new: true }
    );
    return { claimed: true };
  } catch (err) {
    if (err.code !== 11000) throw err;
    const holder = await RegistrationClaim.findOne({ key });
    return { claimed: false, holder };
  }
}

// Ends a claim early (admin released protection) so the customer can be
// registered again straight away.
async function releaseClaim(registrationId) {
  await RegistrationClaim.updateMany({ registrationId }, { $set: { expiresAt: new Date() } });
}

// Re-points a claim when an admin moves a registration to another partner.
async function reassignClaim(registrationId, partnerId) {
  await RegistrationClaim.updateMany({ registrationId }, { $set: { partnerId } });
}

module.exports = { findDuplicate, findOrCreateCustomer, claimProtection, releaseClaim, reassignClaim };
