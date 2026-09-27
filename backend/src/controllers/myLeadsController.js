const Customer = require('../models/Customer');
const Registration = require('../models/Registration');
const TeamMember = require('../models/TeamMember');
const ProgressEvent = require('../models/ProgressEvent');
const Booking = require('../models/Booking');
const CommissionEligibility = require('../models/CommissionEligibility');
const { nextId } = require('../utils/idGenerator');
const { findDuplicate } = require('../services/duplicateService');
const { createInitialOwnership, getOwnership, transferOperationalOwnershipToBuilder } = require('../services/ownershipService');
const { logEvent, getTimeline } = require('../services/auditService');
const { withIdempotency } = require('../services/idempotencyService');
const { getSettings } = require('../services/settingsService');
const { listFieldDefinitions } = require('../services/leadFieldDefinitionService');
const { triggerWebhooks } = require('../services/webhookService');
const { normalizeMobile, validateMobileField } = require('../utils/phone');

// The authenticated, ownership-enforced counterpart to registrationController
// / bookingController - every operation here is scoped to req.partnerId (set
// by partnerAuth), never to a partnerId supplied by the caller. This is what
// closes the "one partner must never see another partner's registrations"
// safeguard (spec section 21) for the self-service portal.

async function assertOwnedRegistration(registrationId, partnerId) {
  const registration = await Registration.findOne({ registrationId });
  if (!registration) return { error: { status: 404, reason: 'Registration not found' } };
  if (registration.partnerId !== partnerId) return { error: { status: 403, reason: 'This registration does not belong to your account' } };
  return { registration };
}

// GET /api/channel-partner/my/registrations
// Includes the lead's name/mobile inline (not just IDs) - the list is the
// primary "who are my leads" view, so it needs to actually show who they are.
// Also embeds the full customer sub-document (section 40) so the grid can
// render every 'customer'-scope field (alternateMobile, email, ...) as its
// own column, not just name/mobile.
async function listMyRegistrations(req, res, next) {
  try {
    const registrations = await Registration.find({ partnerId: req.partnerId }).sort({ registeredAt: -1 });
    const customers = await Customer.find({ customerId: { $in: registrations.map((r) => r.customerId) } });
    const customerById = new Map(customers.map((c) => [c.customerId, c]));
    const members = await TeamMember.find({ partnerId: req.partnerId });
    const memberNameById = new Map(members.map((m) => [m.memberId, m.name]));

    const enriched = registrations.map((r) => {
      const customer = customerById.get(r.customerId);
      return {
        ...r.toObject(),
        customerName: customer?.name || '',
        customerMobile: customer?.mobile || '',
        customer: customer ? customer.toObject() : null,
        assignedToName: r.assignedTo ? memberNameById.get(r.assignedTo) || '' : ''
      };
    });

    return res.json({ count: enriched.length, registrations: enriched });
  } catch (err) {
    next(err);
  }
}

// Real-estate lead requirement fields (section 33) - all optional, carried
// straight through from the lead form onto the Registration document.
const REQUIREMENT_FIELDS = [
  'requirementType', 'propertyType', 'bhk', 'budgetMin', 'budgetMax',
  'preferredLocation', 'possessionTimeline', 'leadSource', 'notes'
];

// POST /api/channel-partner/my/registrations
async function createMyRegistration(req, res, next) {
  try {
    const { customer, source, externalReferenceId } = req.body;
    const projectId = req.body.projectId || '';
    const partnerId = req.partnerId;

    // Only the lead's name and mobile number are mandatory by default
    // (section 33) - project and every requirement detail below are
    // optional, UNLESS the partner has marked additional fields required
    // in their own lead-form Settings (section 36), checked dynamically below.
    if (!customer || !customer.mobile) {
      return res.status(400).json({ status: 'ERROR', reason: 'customer.mobile is required', fieldKey: 'mobile' });
    }
    if (!customer.name) {
      return res.status(400).json({ status: 'ERROR', reason: 'customer.name is required', fieldKey: 'name' });
    }

    // A country code is mandatory (section 7 - the app is used worldwide, so
    // a bare 10-digit number is ambiguous about which country's numbering
    // plan it even belongs to). `customer.mobileCountry` is an optional
    // companion ISO code (e.g. "IN") a caller can send alongside the raw
    // number - when present it lets a bare national number ("9876543210")
    // validate directly and enables country-mismatch detection; callers
    // that don't send it keep the older require-an-embedded-"+" behavior.
    const mobileCheck = validateMobileField(customer.mobile, customer.mobileCountry);
    if (!mobileCheck.valid) return res.status(400).json({ status: 'ERROR', reason: mobileCheck.reason, fieldKey: 'mobile', code: mobileCheck.code });
    customer.mobile = mobileCheck.e164;
    if (customer.alternateMobile) {
      const altCheck = validateMobileField(customer.alternateMobile, customer.alternateMobileCountry);
      if (!altCheck.valid) return res.status(400).json({ status: 'ERROR', reason: altCheck.reason, fieldKey: 'alternateMobile', code: altCheck.code });
      customer.alternateMobile = altCheck.e164;
    }

    const fieldDefs = await listFieldDefinitions(partnerId);
    const getIncomingValue = (def) => (def.scope === 'customer' ? customer?.[def.fieldKey] : req.body[def.fieldKey]);
    for (const def of fieldDefs) {
      if (!def.isEnabled || !def.isRequired) continue;
      const value = getIncomingValue(def);
      if (value === undefined || value === null || value === '') {
        return res.status(400).json({ status: 'ERROR', reason: `${def.label} is required`, fieldKey: def.fieldKey });
      }
    }

    const customFieldValues = {};
    for (const def of fieldDefs) {
      if (def.scope === 'custom' && def.isEnabled && req.body[def.fieldKey] !== undefined && req.body[def.fieldKey] !== '') {
        customFieldValues[def.fieldKey] = req.body[def.fieldKey];
      }
    }

    // Every field the partner actually filled in, for the History view
    // (section 42) - rendered there as "Field added -> value" bullets under
    // one "done by X" entry, the same shape updateMyRegistration produces
    // for edits.
    const changes = [];
    for (const def of fieldDefs) {
      const value = getIncomingValue(def);
      if (value === undefined || value === null || value === '') continue;
      changes.push({ fieldKey: def.fieldKey, label: def.label, value });
    }

    const { result } = await withIdempotency(externalReferenceId, 'createMyRegistration', async () => {
      const duplicate = await findDuplicate({ mobile: customer.mobile, email: customer.email, projectId });

      if (duplicate) {
        await logEvent({
          registrationId: duplicate.registrationId,
          eventType: 'REGISTRATION_ATTEMPT_REJECTED',
          actor: req.actorLabel,
          source: source || 'PARTNER_CRM',
          description: `Duplicate registration attempt by ${partnerId} rejected`
        });

        return {
          status: 'REJECTED',
          reasonCode: 'DUPLICATE_PROTECTED',
          reason: 'Customer is already registered by another partner.',
          protectedUntil: duplicate.protectionExpiry
        };
      }

      let customerDoc = await Customer.findOne({ mobileNormalized: normalizeMobile(customer.mobile) });
      if (!customerDoc) {
        const customerId = await nextId('CUST');
        customerDoc = await Customer.create({
          customerId,
          name: customer.name,
          mobile: customer.mobile,
          email: customer.email,
          alternateMobile: customer.alternateMobile
        });
      } else if (customer.alternateMobile && !customerDoc.alternateMobile) {
        customerDoc.alternateMobile = customer.alternateMobile;
        await customerDoc.save();
      }

      const { duplicateProtectionDays } = await getSettings();
      const registrationId = await nextId('REG');
      const registeredAt = new Date();
      const protectionExpiry = new Date(registeredAt.getTime() + duplicateProtectionDays * 24 * 60 * 60 * 1000);

      const requirementDetails = {};
      for (const field of REQUIREMENT_FIELDS) {
        if (req.body[field] !== undefined && req.body[field] !== '') requirementDetails[field] = req.body[field];
      }

      const registrationDoc = await Registration.create({
        registrationId,
        customerId: customerDoc.customerId,
        partnerId,
        projectId,
        status: 'ACCEPTED',
        currentStage: 'Registered',
        registeredAt,
        protectionStart: registeredAt,
        protectionExpiry,
        externalReferenceId,
        source: source || 'PARTNER_CRM',
        ...requirementDetails,
        customFields: customFieldValues
      });

      await createInitialOwnership(registrationId, partnerId);

      const eventId = await nextId('PROG');
      await ProgressEvent.create({
        eventId,
        registrationId,
        stage: 'Registered',
        eventType: 'REGISTRATION_CREATED',
        source: source || 'PARTNER_CRM'
      });

      await logEvent({
        registrationId,
        eventType: 'REGISTRATION_RECEIVED',
        actor: req.actorLabel,
        newValue: { changes },
        description: 'Partner registration received'
      });
      await logEvent({ registrationId, eventType: 'DUPLICATE_CHECK_COMPLETED', actor: 'SYSTEM', description: 'Duplicate check completed - no active duplicate found' });
      await logEvent({ registrationId, eventType: 'REGISTRATION_ACCEPTED', actor: 'SYSTEM', description: 'Registration accepted' });
      await logEvent({
        registrationId,
        eventType: 'PROTECTION_GRANTED',
        actor: 'SYSTEM',
        newValue: { protectionExpiry },
        description: `${duplicateProtectionDays}-day protection granted`
      });

      // Fire-and-forget (section 43) - an external target being slow or
      // down must never delay or fail this response.
      triggerWebhooks(partnerId, 'LEAD_CREATED', registrationDoc, customerDoc).catch(() => {});

      return {
        status: 'ACCEPTED',
        registrationId,
        owner: partnerId,
        protectionDays: duplicateProtectionDays,
        expiryDate: protectionExpiry
      };
    });

    const httpStatus = result.status === 'REJECTED' ? 409 : 201;
    return res.status(httpStatus).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/my/registrations/:registrationId
async function getMyRegistration(req, res, next) {
  try {
    const { registration, error } = await assertOwnedRegistration(req.params.registrationId, req.partnerId);
    if (error) return res.status(error.status).json({ reason: error.reason });

    const [customer, ownership, booking, commission] = await Promise.all([
      Customer.findOne({ customerId: registration.customerId }),
      getOwnership(registration.registrationId),
      Booking.findOne({ registrationId: registration.registrationId }),
      CommissionEligibility.findOne({ registrationId: registration.registrationId })
    ]);

    return res.json({ registration, customer, ownership, booking, commission });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/channel-partner/my/registrations/:registrationId  (requires MANAGE_LEADS)
// Edit Lead (section 39) - updates whichever fields this partner has
// configured on their lead form (section 36), split by scope the same way
// createMyRegistration reads them: 'customer' fields land on the Customer
// document, 'registration' fields are real Registration schema columns,
// 'custom' fields merge into Registration.customFields. name/mobile/notes
// stay whatever they already were if omitted from the payload (partial
// update, same semantics as updateTeamMember).
function getCurrentFieldValue(def, registration, customer) {
  if (def.scope === 'customer') return customer ? customer[def.fieldKey] : undefined;
  if (def.scope === 'registration') return registration[def.fieldKey];
  return registration.customFields ? registration.customFields[def.fieldKey] : undefined;
}

function valuesEqual(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a || []) === JSON.stringify(b || []);
  const an = a === undefined || a === null ? '' : a;
  const bn = b === undefined || b === null ? '' : b;
  return String(an) === String(bn);
}

async function updateMyRegistration(req, res, next) {
  try {
    const { registrationId } = req.params;
    const { registration, error } = await assertOwnedRegistration(registrationId, req.partnerId);
    if (error) return res.status(error.status).json({ reason: error.reason });

    const fieldDefs = await listFieldDefinitions(req.partnerId);
    const customer = await Customer.findOne({ customerId: registration.customerId });

    // A field required today might not have been when this lead was first
    // registered (or the partner just turned "required" on in Settings) -
    // so an edit that would leave it empty is rejected here too, the same
    // as createMyRegistration, not just on the client.
    for (const def of fieldDefs) {
      if (!def.isEnabled || !def.isRequired) continue;
      const incoming = req.body[def.fieldKey];
      const resolved = incoming !== undefined ? incoming : getCurrentFieldValue(def, registration, customer);
      if (resolved === undefined || resolved === null || resolved === '') {
        return res.status(400).json({ status: 'ERROR', reason: `${def.label} is required`, fieldKey: def.fieldKey });
      }
    }

    for (const fieldKey of ['mobile', 'alternateMobile']) {
      if (!req.body[fieldKey]) continue;
      const check = validateMobileField(req.body[fieldKey], req.body[`${fieldKey}Country`]);
      if (!check.valid) return res.status(400).json({ status: 'ERROR', reason: check.reason, fieldKey, code: check.code });
      req.body[fieldKey] = check.e164;
    }

    // Per-field diff for the History view (section 42) - rendered as
    // "Field  old -> new" bullets, so only fields that actually changed are
    // recorded (a no-op PATCH, or re-sending an unchanged value, logs nothing).
    const changes = [];
    for (const def of fieldDefs) {
      const value = req.body[def.fieldKey];
      if (value === undefined) continue;

      const normalized = def.dataType === 'NUMBER' && value !== '' ? Number(value) : value;
      const previous = getCurrentFieldValue(def, registration, customer);
      if (!valuesEqual(previous, normalized)) {
        changes.push({ fieldKey: def.fieldKey, label: def.label, from: previous, to: normalized });
      }

      if (def.scope === 'customer') {
        if (customer) customer[def.fieldKey] = value;
      } else if (def.scope === 'registration') {
        registration[def.fieldKey] = normalized;
      } else {
        registration.customFields = { ...registration.customFields, [def.fieldKey]: value };
      }
    }

    if (customer) await customer.save();
    await registration.save();

    if (changes.length > 0) {
      await logEvent({
        registrationId,
        eventType: 'LEAD_DETAILS_UPDATED',
        actor: req.actorLabel,
        newValue: { changes },
        description: `Updated ${changes.length} field${changes.length === 1 ? '' : 's'}`
      });
      triggerWebhooks(req.partnerId, 'LEAD_UPDATED', registration, customer).catch(() => {});
    }

    return res.json({ registration, customer });
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/registrations/:registrationId/progress
async function updateMyProgress(req, res, next) {
  try {
    const { registrationId } = req.params;
    const { registration, error } = await assertOwnedRegistration(registrationId, req.partnerId);
    if (error) return res.status(error.status).json({ reason: error.reason });

    const { stage, eventType, source } = req.body;
    const previousStage = registration.currentStage;
    registration.currentStage = stage;
    await registration.save();

    const eventId = await nextId('PROG');
    await ProgressEvent.create({ eventId, registrationId, stage, eventType: eventType || 'STAGE_UPDATED', source: source || 'PARTNER_CRM' });

    await logEvent({
      registrationId,
      eventType: 'STAGE_UPDATED',
      actor: req.actorLabel,
      source: source || 'PARTNER_CRM',
      previousValue: previousStage,
      newValue: stage,
      description: `Partner updated stage to ${stage}`
    });

    const customer = await Customer.findOne({ customerId: registration.customerId });
    triggerWebhooks(req.partnerId, 'STAGE_UPDATED', registration, customer).catch(() => {});

    return res.json({ registrationId, currentStage: stage });
  } catch (err) {
    next(err);
  }
}

// POST /api/channel-partner/my/registrations/:registrationId/booking
async function createMyBooking(req, res, next) {
  try {
    const { registrationId } = req.params;
    const { registration, error } = await assertOwnedRegistration(registrationId, req.partnerId);
    if (error) return res.status(error.status).json({ reason: error.reason });

    const { externalEventId } = req.body;

    const { replayed, result } = await withIdempotency(externalEventId, 'createMyBooking', async () => {
      const bookingId = await nextId('BOOK');
      await Booking.create({ bookingId, registrationId, projectId: registration.projectId, externalEventId });

      await logEvent({ registrationId, eventType: 'BOOKING_COMPLETED', actor: req.actorLabel, description: 'Booking completed' });

      await transferOperationalOwnershipToBuilder(registrationId);
      registration.isBooked = true;
      registration.currentStage = 'Booking';
      await registration.save();

      await logEvent({
        registrationId,
        eventType: 'OPERATIONAL_OWNERSHIP_TRANSFERRED',
        actor: 'SYSTEM',
        previousValue: registration.partnerId,
        newValue: 'BUILDER',
        description: 'Operational ownership transferred to Builder'
      });
      await logEvent({ registrationId, eventType: 'PARTNER_ATTRIBUTION_PRESERVED', actor: 'SYSTEM', newValue: registration.partnerId, description: 'Partner attribution preserved' });

      const commissionId = await nextId('COMM');
      const commission = await CommissionEligibility.create({
        commissionId,
        registrationId,
        partnerId: registration.partnerId,
        bookingId,
        projectId: registration.projectId,
        attributionStatus: 'ATTRIBUTED',
        eligibilityStatus: 'ELIGIBLE'
      });

      await logEvent({ registrationId, eventType: 'COMMISSION_ELIGIBILITY_CREATED', actor: 'SYSTEM', newValue: commission.commissionId, description: 'Commission eligibility created' });
      await logEvent({ registrationId, eventType: 'HANDOVER_COMPLETED', actor: 'SYSTEM', description: 'Handover completed' });

      const customer = await Customer.findOne({ customerId: registration.customerId });
      triggerWebhooks(registration.partnerId, 'BOOKING_COMPLETED', registration, customer).catch(() => {});

      return {
        bookingId,
        registrationId,
        operationalOwner: 'BUILDER',
        partnerAttribution: registration.partnerId,
        commissionEligibility: commission.eligibilityStatus,
        handover: 'Completed'
      };
    });

    return res.status(replayed ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/my/registrations/:registrationId/audit
async function getMyRegistrationAudit(req, res, next) {
  try {
    const { registration, error } = await assertOwnedRegistration(req.params.registrationId, req.partnerId);
    if (error) return res.status(error.status).json({ reason: error.reason });

    const events = await getTimeline(registration.registrationId);
    return res.json({ registrationId: registration.registrationId, events });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/channel-partner/my/registrations/:registrationId/assign
// Which of the partner's own team members is working this lead day-to-day -
// a separate concept from ownership (never touches Ownership/audit-owner
// records), so re-assigning is a lightweight, frequent action, not a
// protected one like the admin's REASSIGN_PARTNER override.
async function assignRegistration(req, res, next) {
  try {
    const { registration, error } = await assertOwnedRegistration(req.params.registrationId, req.partnerId);
    if (error) return res.status(error.status).json({ reason: error.reason });

    const { assignedTo } = req.body;
    let assignedToName = '';
    if (assignedTo) {
      const member = await TeamMember.findOne({ memberId: assignedTo, partnerId: req.partnerId });
      if (!member) return res.status(400).json({ reason: 'Unknown team member for this organisation', fieldKey: 'assignedTo' });
      assignedToName = member.name;
    }

    const previousValue = registration.assignedTo;
    registration.assignedTo = assignedTo || '';
    await registration.save();

    if (previousValue !== registration.assignedTo) {
      await logEvent({
        registrationId: registration.registrationId,
        eventType: 'LEAD_ASSIGNED',
        actor: req.actorLabel,
        previousValue,
        newValue: registration.assignedTo,
        description: assignedToName ? `Assigned to ${assignedToName}` : 'Unassigned'
      });
    }

    return res.json({ registrationId: registration.registrationId, assignedTo: registration.assignedTo, assignedToName });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listMyRegistrations,
  createMyRegistration,
  getMyRegistration,
  updateMyRegistration,
  updateMyProgress,
  createMyBooking,
  getMyRegistrationAudit,
  assignRegistration
};
