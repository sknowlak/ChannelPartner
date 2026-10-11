const RegistrationClaim = require('../models/RegistrationClaim');
const { findDuplicate, findOrCreateCustomer, claimProtection } = require('./duplicateService');
const { resolveProject } = require('./projectService');

// Fields that decide WHO a customer is for duplicate protection (section 7).
const IDENTITY_FIELDS = ['mobile', 'email', 'alternateMobile'];

function problem(statusCode, reason, fieldKey) {
  return { problem: { statusCode, reason, fieldKey } };
}

// Checks an edit to an existing lead (Edit Lead, the status form, or an
// integration import) before anything is saved. `pending` is
// { fieldKey: newValue } for every field that is actually changing;
// `defsByKey` maps fieldKey -> field definition.
//
// Returns { problem } when the edit must be refused, otherwise
// { customerId? } - a new identity record to link the lead to when its
// primary number changed.
//
// Contact details live on the registration itself (section 52), so an edit
// can never touch another partner's data. What still needs guarding is
// protection: a lead must not be edited INTO a customer + project that
// someone else holds (a different number, email or project), and after
// booking the builder owns the lead, so identity and project are frozen.
async function leadEditProblem({ registration, pending, defsByKey }) {
  const changingKeys = Object.keys(pending);
  const identityKeys = changingKeys.filter((k) => defsByKey[k]?.scope === 'customer' && IDENTITY_FIELDS.includes(k));
  const projectChanging = changingKeys.includes('projectId');

  if (registration.isBooked && (identityKeys.length || projectChanging)) {
    return problem(409, 'This lead is booked - its contact details and project can no longer be changed', identityKeys[0] || 'projectId');
  }
  if (!identityKeys.length && !projectChanging) return {};

  const contact = registration.contact || {};
  const identity = {
    mobile: pending.mobile !== undefined ? pending.mobile : contact.mobile,
    email: pending.email !== undefined ? pending.email : contact.email,
    alternateMobile: pending.alternateMobile !== undefined ? pending.alternateMobile : contact.alternateMobile
  };
  const projectId = projectChanging ? String(pending.projectId || '') : registration.projectId || '';

  if (identityKeys.includes('mobile') && !identity.mobile) return problem(400, 'Primary Number is required', 'mobile');
  if (projectChanging) {
    const { error } = await resolveProject(projectId);
    if (error) return problem(400, error, 'projectId');
  }

  const duplicate = await findDuplicate({ ...identity, projectId, excludeRegistrationId: registration.registrationId });
  if (duplicate) {
    return problem(409, `This customer is already protected for that project until ${duplicate.protectionExpiry.toISOString().slice(0, 10)}`, identityKeys[0] || 'projectId');
  }

  // A new primary number is a different person: link the lead to that
  // number's identity record.
  let customerId = registration.customerId;
  if (identityKeys.includes('mobile')) {
    customerId = (await findOrCreateCustomer({ name: contact.name || pending.name || 'Customer', mobile: identity.mobile })).customerId;
  }

  // Move the atomic protection claim to the new customer + project, so a
  // simultaneous registration can't slip in between check and save.
  if ((customerId !== registration.customerId || projectChanging) && registration.protectionExpiry > new Date()) {
    const claim = await claimProtection({
      customerId,
      projectId,
      registrationId: registration.registrationId,
      partnerId: registration.partnerId,
      expiresAt: registration.protectionExpiry
    });
    if (!claim.claimed && claim.holder.registrationId !== registration.registrationId) {
      return problem(409, 'This customer was just registered for that project by someone else', identityKeys[0] || 'projectId');
    }
    await RegistrationClaim.updateMany(
      { registrationId: registration.registrationId, key: { $ne: `${customerId}|${projectId}` } },
      { $set: { expiresAt: new Date() } }
    );
  }

  return customerId !== registration.customerId ? { customerId } : {};
}

module.exports = { leadEditProblem, IDENTITY_FIELDS };
