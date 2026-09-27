const Customer = require('../models/Customer');
const Registration = require('../models/Registration');
const { getSettings } = require('./settingsService');
const { normalizeMobile } = require('../utils/phone');

// Finds an ACTIVE (still-protected) registration matching the incoming
// customer on any configured identity field, scoped to the same project
// (spec section 7). Matches regardless of which partner holds the existing
// registration - ownership must never be silently overwritten, even by the
// same partner re-registering.
async function findDuplicate({ mobile, email, projectId }) {
  projectId = projectId || ''; // leads with no project attached (section 33) share the '' bucket
  const { duplicateMatchFields } = await getSettings();

  const identityFilters = [];
  if (duplicateMatchFields.includes('mobile') && mobile) identityFilters.push({ mobileNormalized: normalizeMobile(mobile) });
  if (duplicateMatchFields.includes('email') && email) identityFilters.push({ email });

  if (identityFilters.length === 0) return null;

  const matchingCustomers = await Customer.find({ $or: identityFilters });
  if (matchingCustomers.length === 0) return null;

  const customerIds = matchingCustomers.map((c) => c.customerId);

  const now = new Date();
  const existingRegistration = await Registration.findOne({
    customerId: { $in: customerIds },
    projectId,
    status: 'ACCEPTED',
    protectionExpiry: { $gt: now }
  }).sort({ registeredAt: -1 });

  return existingRegistration;
}

module.exports = { findDuplicate };
