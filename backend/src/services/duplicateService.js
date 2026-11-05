const Customer = require('../models/Customer');
const Registration = require('../models/Registration');
const RegistrationClaim = require('../models/RegistrationClaim');
const { getSettings } = require('./settingsService');
const { normalizeMobile } = require('../utils/phone');
const { normalizeEmail } = require('../utils/email');
const { nextId } = require('../utils/idGenerator');

// The normalized identifiers a person is matched on, limited to the fields
// the admin has enabled for duplicate matching (Settings.duplicateMatchFields).
// Primary and alternate numbers share one list - a number is the same person
// whichever slot it was typed into.
function identityKeys({ mobile, email, alternateMobile }, duplicateMatchFields) {
  const mobiles = [];
  if (duplicateMatchFields.includes('mobile')) {
    for (const number of [mobile, alternateMobile]) {
      if (!number) continue;
      const key = normalizeMobile(String(number));
      if (key && !mobiles.includes(key)) mobiles.push(key);
    }
  }
  const emails = [];
  if (duplicateMatchFields.includes('email') && email) {
    const key = normalizeEmail(String(email));
    if (key) emails.push(key);
  }
  return { mobiles, emails };
}

// Registration query clauses matching any of those identifiers.
function matchClauses({ mobiles, emails }) {
  const clauses = [];
  for (const key of mobiles) clauses.push({ 'match.mobile': key }, { 'match.alternateMobile': key });
  for (const key of emails) clauses.push({ 'match.email': key });
  return clauses;
}

// Finds an ACTIVE (still-protected) registration of the same person for the
// same project (spec section 7), matching on the normalized keys each
// registration keeps of its own contact details (section 52) - primary and
// alternate numbers are checked against both, emails ignore case, spaces
// and +tags. Matches regardless of which partner holds it: ownership must
// never be silently overwritten, even by the same partner re-registering.
// A BOOKED registration protects its customer + project permanently - once
// the builder has a booking (and a partner a commission) for that person, a
// re-registration after the protection window must not be able to earn a
// second one. `excludeRegistrationId` lets an edit of an existing lead ask
// "would this collide with anyone else?".
async function findDuplicate({ mobile, email, alternateMobile, projectId, excludeRegistrationId }) {
  projectId = String(projectId || ''); // leads with no project attached (section 33) share the '' bucket
  const { duplicateMatchFields } = await getSettings();
  const clauses = matchClauses(identityKeys({ mobile, email, alternateMobile }, duplicateMatchFields));
  if (clauses.length === 0) return null;

  const filter = {
    $and: [{ $or: clauses }, { $or: [{ protectionExpiry: { $gt: new Date() } }, { isBooked: true }] }],
    projectId,
    status: 'ACCEPTED'
  };
  if (excludeRegistrationId) filter.registrationId = { $ne: excludeRegistrationId };
  return Registration.findOne(filter).sort({ isBooked: -1, registeredAt: -1 });
}

// Another registration of the same person + project that is already BOOKED -
// booking this one too would pay a second commission for one customer.
// Matches on the identity record and on every contact key, whatever the
// duplicate-match settings say (a booked buyer is never a "different
// person" just because email matching happens to be switched off).
async function findBookedDuplicate(registration) {
  const c = registration.contact || {};
  const clauses = [
    { customerId: registration.customerId },
    ...matchClauses(identityKeys({ mobile: c.mobile, email: c.email, alternateMobile: c.alternateMobile }, ['mobile', 'email']))
  ];
  return Registration.findOne({
    $or: clauses,
    projectId: registration.projectId || '',
    isBooked: true,
    registrationId: { $ne: registration.registrationId }
  });
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

// Every claim key a registration must hold: the legacy `${customerId}|project`
// key (the only kind claims used to have, so older claims still block) plus
// one per normalized identifier. Without the identifier keys, two partners
// racing with the same ALTERNATE number or email (but different primary
// numbers -> different customerIds) never touched a shared key and could
// both be ACCEPTED.
async function claimKeysFor({ customerId, projectId, mobile, email, alternateMobile }) {
  const project = String(projectId || '');
  const keys = new Set([`${customerId}|${project}`]);
  if (mobile || email || alternateMobile) {
    const { duplicateMatchFields } = await getSettings();
    const { mobiles, emails } = identityKeys({ mobile, email, alternateMobile }, duplicateMatchFields);
    for (const m of mobiles) keys.add(`m:${m}|${project}`);
    for (const e of emails) keys.add(`e:${e}|${project}`);
  }
  // A fixed order, so two requests needing overlapping keys take them in the
  // same sequence and the loser fails cleanly on the first shared one.
  return [...keys].sort();
}

// Takes one claim key: succeeds when nobody holds it, the holder's
// protection has expired, or this registration already holds it; otherwise
// the unique key makes the upsert fail. Returns null on success, else the
// current holder.
async function claimKey(key, { registrationId, partnerId, expiresAt }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await RegistrationClaim.findOneAndUpdate(
        { key, $or: [{ expiresAt: { $lte: new Date() } }, { registrationId }] },
        { $set: { registrationId, partnerId, expiresAt } },
        { upsert: true, new: true }
      );
      return null;
    } catch (err) {
      if (err.code !== 11000) throw err;
      const holder = await RegistrationClaim.findOne({ key });
      if (holder) return holder;
      // The holder vanished between the two calls - just try again.
    }
  }
  throw new Error(`Could not claim protection key ${key}`);
}

// Atomically takes protection of the person + project for a registration.
// Every key from claimKeysFor must be won; if one is held by someone else
// the keys already taken are given back and the caller gets that holder.
// Returns { claimed: true, keys } or { claimed: false, holder }.
// mobile/email/alternateMobile are optional - without them only the legacy
// customer key is claimed (the old behaviour).
async function claimProtection({ customerId, projectId, registrationId, partnerId, expiresAt, mobile, email, alternateMobile }) {
  const keys = await claimKeysFor({ customerId, projectId, mobile, email, alternateMobile });
  // Keys this registration already holds (an edit re-claiming) are never
  // given back on failure - only the ones this call newly took.
  const alreadyHeld = new Set(
    (await RegistrationClaim.find({ key: { $in: keys }, registrationId, expiresAt: { $gt: new Date() } }).select('key')).map((c) => c.key)
  );
  const taken = [];
  for (const key of keys) {
    let holder;
    try {
      holder = await claimKey(key, { registrationId, partnerId, expiresAt });
    } catch (err) {
      await giveBack(taken, registrationId);
      throw err;
    }
    if (holder) {
      await giveBack(taken, registrationId);
      return { claimed: false, holder };
    }
    if (!alreadyHeld.has(key)) taken.push(key);
  }
  return { claimed: true, keys };
}

async function giveBack(keys, registrationId) {
  if (!keys.length) return;
  await RegistrationClaim.updateMany({ key: { $in: keys }, registrationId }, { $set: { expiresAt: new Date() } });
}

// Ends a registration's claims early (admin released protection, or a
// create failed after claiming) so the customer can be registered again
// straight away. Covers every key the registration holds.
async function releaseClaim(registrationId) {
  await RegistrationClaim.updateMany({ registrationId }, { $set: { expiresAt: new Date() } });
}

// Re-points a claim when an admin moves a registration to another partner.
async function reassignClaim(registrationId, partnerId) {
  await RegistrationClaim.updateMany({ registrationId }, { $set: { partnerId } });
}

module.exports = { findDuplicate, findBookedDuplicate, findOrCreateCustomer, claimProtection, claimKeysFor, releaseClaim, reassignClaim };
