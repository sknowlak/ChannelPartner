const Customer = require('../models/Customer');
const Registration = require('../models/Registration');
const RegistrationClaim = require('../models/RegistrationClaim');
const { getSettings } = require('./settingsService');
const { normalizeMobile } = require('../utils/phone');
const { normalizeEmail } = require('../utils/email');
const { escapeRegex } = require('../utils/partnerFilter');
const { nextId } = require('../utils/idGenerator');

// Customer documents that represent the same person as the incoming
// identity, on whichever match fields are configured (section 7):
// - mobile: the primary AND alternate numbers are checked against both the
//   stored primary and alternate numbers (a second partner can't slip the
//   same customer in under their other phone);
// - email: matched on the normalized form (case, spaces, +tags ignored).
// The non-normalized fallbacks cover Customer records saved before the
// normalized keys existed.
async function findMatchingCustomers({ mobile, email, alternateMobile }) {
  const { duplicateMatchFields } = await getSettings();
  const filters = [];

  if (duplicateMatchFields.includes('mobile')) {
    for (const number of [mobile, alternateMobile]) {
      if (!number) continue;
      const key = normalizeMobile(String(number));
      filters.push({ mobileNormalized: key }, { alternateMobileNormalized: key }, { alternateMobile: String(number) });
    }
  }
  if (duplicateMatchFields.includes('email') && email) {
    const trimmed = String(email).trim();
    filters.push({ emailNormalized: normalizeEmail(trimmed) }, { email: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' } });
  }

  if (filters.length === 0) return [];
  return Customer.find({ $or: filters });
}

// Finds an ACTIVE (still-protected) registration matching the incoming
// customer on any configured identity field, scoped to the same project
// (spec section 7). Matches regardless of which partner holds the existing
// registration - ownership must never be silently overwritten, even by the
// same partner re-registering. `excludeRegistrationId` lets an edit of an
// existing lead check "would this collide with anyone else?".
async function findDuplicate({ mobile, email, alternateMobile, projectId, excludeRegistrationId }) {
  projectId = String(projectId || ''); // leads with no project attached (section 33) share the '' bucket

  const matchingCustomers = await findMatchingCustomers({ mobile, email, alternateMobile });
  if (matchingCustomers.length === 0) return null;

  const filter = {
    customerId: { $in: matchingCustomers.map((c) => c.customerId) },
    projectId,
    status: 'ACCEPTED',
    protectionExpiry: { $gt: new Date() }
  };
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

module.exports = { findDuplicate, findMatchingCustomers, findOrCreateCustomer, claimProtection, releaseClaim, reassignClaim };
