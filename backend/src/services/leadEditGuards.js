const Registration = require('../models/Registration');
const Customer = require('../models/Customer');
const { findDuplicate, claimProtection } = require('./duplicateService');
const { normalizeMobile } = require('../utils/phone');

// Fields that decide WHO a customer is for duplicate protection (section 7).
const IDENTITY_FIELDS = ['mobile', 'email', 'alternateMobile'];

function problem(statusCode, reason, fieldKey) {
  return { statusCode, reason, fieldKey };
}

// Checks an edit to an existing lead (Edit Lead, or fields on the status
// form) before anything is saved. `pending` is { fieldKey: newValue } for
// every field that is actually changing; `defsByKey` maps fieldKey -> def.
// Returns null when the edit is allowed, otherwise { statusCode, reason, fieldKey }.
//
// Closes three ways a partner could take another partner's protected customer:
// 1. Customer records are shared across partners (one per phone number).
//    Editing contact details on a customer that another partner also has a
//    lead for would rewrite THEIR lead too - e.g. change the mobile so the
//    original number no longer matches, then register it fresh.
// 2. Changing a lead's mobile/email to someone else's protected customer.
// 3. Changing a lead's project into a project where another partner already
//    holds protection on this customer.
// After booking the builder owns the lead (section 13), so identity and
// project are frozen.
async function leadEditProblem({ registration, customer, pending, defsByKey }) {
  const changingKeys = Object.keys(pending);
  const customerKeys = changingKeys.filter((k) => defsByKey[k]?.scope === 'customer');
  const identityKeys = customerKeys.filter((k) => IDENTITY_FIELDS.includes(k));
  const projectChanging = changingKeys.includes('projectId');

  if (registration.isBooked && (identityKeys.length || projectChanging)) {
    return problem(409, 'This lead is booked - its contact details and project can no longer be changed', identityKeys[0] || 'projectId');
  }

  if (customerKeys.length && customer) {
    const sharedWithOtherPartner = await Registration.exists({
      customerId: customer.customerId,
      partnerId: { $ne: registration.partnerId }
    });
    if (sharedWithOtherPartner) {
      return problem(409, 'This customer is also registered with another partner, so their contact details are locked', customerKeys[0]);
    }
  }

  const identity = {
    mobile: pending.mobile !== undefined ? pending.mobile : customer?.mobile,
    email: pending.email !== undefined ? pending.email : customer?.email,
    alternateMobile: pending.alternateMobile !== undefined ? pending.alternateMobile : customer?.alternateMobile
  };
  const projectId = projectChanging ? String(pending.projectId || '') : registration.projectId || '';

  if (identityKeys.includes('mobile')) {
    if (!identity.mobile) return problem(400, 'Primary Number is required', 'mobile');
    const owner = await Customer.findOne({ mobileNormalized: normalizeMobile(identity.mobile) });
    if (owner && owner.customerId !== customer?.customerId) {
      return problem(409, 'Another customer already has this number - register them as a new lead instead', 'mobile');
    }
  }

  if (identityKeys.length || projectChanging) {
    const duplicate = await findDuplicate({ ...identity, projectId, excludeRegistrationId: registration.registrationId });
    if (duplicate) {
      return problem(409, `This customer is already protected for that project until ${duplicate.protectionExpiry.toISOString().slice(0, 10)}`, identityKeys[0] || 'projectId');
    }
  }

  if (projectChanging && customer && registration.protectionExpiry > new Date()) {
    const claim = await claimProtection({
      customerId: customer.customerId,
      projectId,
      registrationId: registration.registrationId,
      partnerId: registration.partnerId,
      expiresAt: registration.protectionExpiry
    });
    if (!claim.claimed && claim.holder.registrationId !== registration.registrationId) {
      return problem(409, 'This customer was just registered for that project by someone else', 'projectId');
    }
  }

  return null;
}

module.exports = { leadEditProblem, IDENTITY_FIELDS };
