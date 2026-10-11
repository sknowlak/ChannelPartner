const Customer = require('../models/Customer');
const Registration = require('../models/Registration');
const ProgressEvent = require('../models/ProgressEvent');
const Booking = require('../models/Booking');
const CommissionEligibility = require('../models/CommissionEligibility');
const { nextId } = require('../utils/idGenerator');
const { findDuplicate, findOrCreateCustomer, claimProtection } = require('../services/duplicateService');
const { createInitialOwnership, getOwnership } = require('../services/ownershipService');
const { completeBooking } = require('../services/bookingService');
const { leadEditProblem } = require('../services/leadEditGuards');
const { fieldValueProblem } = require('../utils/fieldValues');
const { logEvent, getTimeline } = require('../services/auditService');
const { withIdempotency } = require('../services/idempotencyService');
const { getSettings } = require('../services/settingsService');
const { listFieldDefinitions } = require('../services/leadFieldDefinitionService');
const { triggerWebhooks } = require('../services/webhookService');
const { validateMobileField } = require('../utils/phone');
const { listStatuses, getDefaultStatusName, resolveStatus } = require('../services/leadStatusService');
const { planForStatusChange } = require('../services/notificationService');
const { loadOrgUsers, publicUser } = require('../services/userDirectoryService');

// Everyone a lead can be assigned to (section 48): the account owner plus
// every team member, inactive ones flagged - see userDirectoryService.
async function loadAssignableUsers(partnerId) {
  return (await loadOrgUsers(partnerId)).map(publicUser);
}

// Who did it, in the assignedTo/Notification id space (owner = partnerId).
function actorOf(req) {
  return { userId: req.memberId || req.partnerId, label: req.actorLabel };
}

function planNotifications(req, registration) {
  planForStatusChange({ partnerId: registration.partnerId, registration, actor: actorOf(req) })
    .catch((err) => console.error('[notifications] planning failed', err));
}

// The authenticated, ownership-enforced counterpart to registrationController
// / bookingController - every operation here is scoped to req.partnerId (set
// by partnerAuth), never to a partnerId supplied by the caller. This is what
// closes the "one partner must never see another partner's registrations"
// safeguard (spec section 21) for the self-service portal.

async function assertOwnedRegistration(registrationId, partnerId) {
  const registration = await Registration.findOne({ registrationId: String(registrationId) });
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
    const users = await loadAssignableUsers(req.partnerId);
    const userNameById = new Map(users.map((u) => [u.userId, u.name]));

    const enriched = registrations.map((r) => {
      const customer = customerById.get(r.customerId);
      return {
        ...r.toObject(),
        customerName: customer?.name || '',
        customerMobile: customer?.mobile || '',
        customer: customer ? customer.toObject() : null,
        assignedToName: r.assignedTo ? userNameById.get(r.assignedTo) || '' : ''
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
    const projectId = String(req.body.projectId || '');
    const partnerId = req.partnerId;

    // Only the lead's name and mobile number are mandatory by default
    // (section 33) - project and every requirement detail below are
    // optional, UNLESS the partner has marked additional fields required
    // in their own lead-form Settings (section 36), checked dynamically below.
    if (!customer || typeof customer !== 'object' || !customer.mobile) {
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

    for (const def of fieldDefs) {
      const valueProblem = fieldValueProblem(def, getIncomingValue(def));
      if (valueProblem) return res.status(400).json({ status: 'ERROR', reason: valueProblem, fieldKey: def.fieldKey });
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
      const rejectDuplicate = async (existingRegistrationId, protectedUntil) => {
        await logEvent({
          registrationId: existingRegistrationId,
          eventType: 'REGISTRATION_ATTEMPT_REJECTED',
          actor: req.actorLabel,
          source: source || 'PARTNER_CRM',
          description: `Duplicate registration attempt by ${partnerId} rejected`
        });
        return {
          status: 'REJECTED',
          reasonCode: 'DUPLICATE_PROTECTED',
          reason: 'Customer is already registered by another partner.',
          protectedUntil
        };
      };

      const duplicate = await findDuplicate({ mobile: customer.mobile, email: customer.email, alternateMobile: customer.alternateMobile, projectId });
      if (duplicate) return rejectDuplicate(duplicate.registrationId, duplicate.protectionExpiry);

      const customerDoc = await findOrCreateCustomer({
        name: customer.name,
        mobile: customer.mobile,
        email: customer.email,
        alternateMobile: customer.alternateMobile
      });
      if (customer.alternateMobile && !customerDoc.alternateMobile) {
        customerDoc.alternateMobile = customer.alternateMobile;
        await customerDoc.save();
      }

      const { duplicateProtectionDays } = await getSettings();
      const registrationId = await nextId('REG');
      const registeredAt = new Date();
      const protectionExpiry = new Date(registeredAt.getTime() + duplicateProtectionDays * 24 * 60 * 60 * 1000);

      // The check above can race with a simultaneous registration of the same
      // customer; the claim is the atomic tie-breaker - only one wins.
      const claim = await claimProtection({ customerId: customerDoc.customerId, projectId, registrationId, partnerId, expiresAt: protectionExpiry });
      if (!claim.claimed) return rejectDuplicate(claim.holder.registrationId, claim.holder.expiresAt);

      const requirementDetails = {};
      for (const field of REQUIREMENT_FIELDS) {
        if (req.body[field] !== undefined && req.body[field] !== '') requirementDetails[field] = req.body[field];
      }

      const initialStage = await getDefaultStatusName(partnerId);
      const registrationDoc = await Registration.create({
        registrationId,
        customerId: customerDoc.customerId,
        partnerId,
        projectId,
        status: 'ACCEPTED',
        currentStage: initialStage,
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
        stage: initialStage,
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
      planNotifications(req, registrationDoc);

      return {
        status: 'ACCEPTED',
        registrationId,
        owner: partnerId,
        protectionDays: duplicateProtectionDays,
        expiryDate: protectionExpiry
      };
    }, partnerId);

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

    let assignedToName = '';
    if (registration.assignedTo) {
      const users = await loadAssignableUsers(req.partnerId);
      assignedToName = users.find((u) => u.userId === registration.assignedTo)?.name || '';
    }

    return res.json({ registration, customer, ownership, booking, commission, assignedToName });
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

    // Only fields switched on in Settings can be written (a disabled field
    // is hidden on the form, so it must not be editable through the API).
    const editableDefs = fieldDefs.filter((def) => def.isEnabled && req.body[def.fieldKey] !== undefined);
    for (const def of editableDefs) {
      const valueProblem = fieldValueProblem(def, req.body[def.fieldKey]);
      if (valueProblem) return res.status(400).json({ status: 'ERROR', reason: valueProblem, fieldKey: def.fieldKey });
    }

    // Per-field diff for the History view (section 42) - rendered as
    // "Field  old -> new" bullets, so only fields that actually changed are
    // recorded (a no-op PATCH, or re-sending an unchanged value, logs nothing).
    const changes = [];
    const pending = {};
    for (const def of editableDefs) {
      const value = req.body[def.fieldKey];
      const normalized = (def.dataType === 'NUMBER' || def.dataType === 'CURRENCY') && value !== '' ? Number(value) : value;
      const previous = getCurrentFieldValue(def, registration, customer);
      if (valuesEqual(previous, normalized)) continue;
      changes.push({ fieldKey: def.fieldKey, label: def.label, from: previous, to: normalized });
      pending[def.fieldKey] = normalized;
    }

    const defsByKey = Object.fromEntries(fieldDefs.map((d) => [d.fieldKey, d]));
    const editProblem = await leadEditProblem({ registration, customer, pending, defsByKey });
    if (editProblem) return res.status(editProblem.statusCode).json({ status: 'ERROR', reason: editProblem.reason, fieldKey: editProblem.fieldKey });

    for (const [fieldKey, normalized] of Object.entries(pending)) {
      const def = defsByKey[fieldKey];
      const value = req.body[fieldKey];
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

    // Status update (sections 48/49): status, sub-status, an optional note,
    // the schedule date & time when the chosen status asks for one, and the
    // lead fields that status is configured to show (required ones must end
    // up filled - either sent now or already on the lead). `subStatus`/
    // `notes`/`fields` absent from the body leave things alone, so callers
    // sending just { stage } (mobile app, inbound API) behave as before.
    const { eventType, source } = req.body;
    const stage = req.body.stage || registration.currentStage;
    const stageChanged = stage !== registration.currentStage;
    let subStatus;
    if (req.body.subStatus !== undefined) subStatus = String(req.body.subStatus || '');
    else subStatus = stageChanged ? '' : registration.subStatus || '';

    // After booking the builder is the operational owner (section 13) - the
    // partner keeps attribution but can no longer move the lead's status.
    if (registration.isBooked && (stageChanged || subStatus !== (registration.subStatus || ''))) {
      return res.status(409).json({ reason: 'This lead is booked - its status is now managed by the builder', fieldKey: 'stage' });
    }

    const resolved = await resolveStatus(req.partnerId, stage, subStatus);
    if (resolved.error) return res.status(400).json({ reason: resolved.error, fieldKey: resolved.status ? 'subStatus' : 'stage' });
    if (stageChanged && (!resolved.status.isActive || resolved.status.isBooking)) {
      return res.status(400).json({
        reason: resolved.status.isBooking ? 'Use Complete Booking to book a lead' : `"${stage}" is inactive`,
        fieldKey: 'stage'
      });
    }
    if (resolved.subStatus && !resolved.subStatus.isActive && subStatus !== (registration.subStatus || '')) {
      return res.status(400).json({ reason: `"${subStatus}" is inactive`, fieldKey: 'subStatus' });
    }

    // Schedule: required by the status -> must be a valid date; not asked
    // for -> cleared (it belonged to the previous status).
    let scheduledAt = null;
    if (resolved.requiresSchedule) {
      const raw = req.body.scheduledAt !== undefined ? req.body.scheduledAt : registration.scheduledAt;
      const parsed = raw ? new Date(raw) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ reason: `${resolved.scheduleLabel} is required for ${subStatus || stage}`, fieldKey: 'scheduledAt' });
      }
      scheduledAt = parsed;
    }

    const fieldDefs = await listFieldDefinitions(req.partnerId);
    const customer = await Customer.findOne({ customerId: registration.customerId });
    const incoming = req.body.fields && typeof req.body.fields === 'object' ? req.body.fields : {};
    const formDefs = resolved.fields
      .map((f) => ({ ...f, def: fieldDefs.find((d) => d.fieldKey === f.fieldKey && d.isEnabled) }))
      .filter((f) => f.def);

    // The Notes field is filled from the update's own note box.
    const notes = req.body.notes !== undefined ? String(req.body.notes || '').trim() : '';
    for (const f of formDefs) {
      let value = incoming[f.fieldKey] !== undefined ? incoming[f.fieldKey] : getCurrentFieldValue(f.def, registration, customer);
      if (f.fieldKey === 'notes' && notes) value = notes;
      const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
      if (f.isRequired && empty) {
        return res.status(400).json({ reason: `${f.def.label} is required for ${subStatus || stage}`, fieldKey: f.fieldKey });
      }
    }
    for (const fieldKey of ['mobile', 'alternateMobile']) {
      if (!incoming[fieldKey] || !formDefs.some((f) => f.fieldKey === fieldKey)) continue;
      const check = validateMobileField(incoming[fieldKey], incoming[`${fieldKey}Country`]);
      if (!check.valid) return res.status(400).json({ reason: check.reason, fieldKey, code: check.code });
      incoming[fieldKey] = check.e164;
    }
    for (const f of formDefs) {
      const valueProblem = fieldValueProblem(f.def, incoming[f.fieldKey]);
      if (valueProblem) return res.status(400).json({ reason: valueProblem, fieldKey: f.fieldKey });
    }

    const changes = [];
    if (stageChanged) changes.push({ fieldKey: 'stage', label: 'Status', from: registration.currentStage, to: stage });
    if (subStatus !== (registration.subStatus || '')) {
      changes.push({ fieldKey: 'subStatus', label: 'Sub-Status', from: registration.subStatus || '', to: subStatus });
    }
    const prevSchedule = registration.scheduledAt ? new Date(registration.scheduledAt).toISOString() : '';
    const nextSchedule = scheduledAt ? scheduledAt.toISOString() : '';
    if (prevSchedule !== nextSchedule) {
      changes.push({ fieldKey: 'scheduledAt', label: resolved.requiresSchedule ? resolved.scheduleLabel : 'Schedule', from: prevSchedule, to: nextSchedule });
    }
    // A note replaces the lead's Notes field (the latest note); every
    // earlier note stays readable in History through this change entry.
    if (notes && notes !== (registration.notes || '')) {
      changes.push({ fieldKey: 'notes', label: 'Notes', from: registration.notes || '', to: notes });
    }
    // Lead fields shown on this status's form (section 49) - same scope-
    // aware write + per-field diff + edit guard as Edit Lead.
    const pending = {};
    for (const f of formDefs) {
      if (incoming[f.fieldKey] === undefined || f.fieldKey === 'notes') continue;
      const { def } = f;
      const value = incoming[f.fieldKey];
      const normalized = (def.dataType === 'NUMBER' || def.dataType === 'CURRENCY') && value !== '' ? Number(value) : value;
      if (!valuesEqual(getCurrentFieldValue(def, registration, customer), normalized)) pending[def.fieldKey] = normalized;
    }
    const defsByKey = Object.fromEntries(formDefs.map((f) => [f.fieldKey, f.def]));
    const editProblem = await leadEditProblem({ registration, customer, pending, defsByKey });
    if (editProblem) return res.status(editProblem.statusCode).json({ reason: editProblem.reason, fieldKey: editProblem.fieldKey });

    for (const f of formDefs) {
      if (pending[f.fieldKey] === undefined) continue;
      const { def } = f;
      const value = incoming[f.fieldKey];
      const normalized = pending[f.fieldKey];
      const previous = getCurrentFieldValue(def, registration, customer);
      changes.push({ fieldKey: def.fieldKey, label: def.label, from: previous, to: normalized });
      if (def.scope === 'customer') {
        if (customer) customer[def.fieldKey] = value;
      } else if (def.scope === 'registration') {
        registration[def.fieldKey] = normalized;
      } else {
        registration.customFields = { ...registration.customFields, [def.fieldKey]: value };
      }
    }

    if (changes.length === 0) {
      return res.json({ registrationId, currentStage: registration.currentStage, subStatus: registration.subStatus || '', notes: registration.notes || '', scheduledAt: registration.scheduledAt || null });
    }

    const previousStage = registration.currentStage;
    const statusChanged = changes.some((c) => ['stage', 'subStatus', 'scheduledAt'].includes(c.fieldKey));
    registration.currentStage = stage;
    registration.subStatus = subStatus;
    registration.scheduledAt = scheduledAt;
    if (notes) registration.notes = notes;
    if (customer && changes.some((c) => formDefs.find((f) => f.fieldKey === c.fieldKey)?.def.scope === 'customer')) await customer.save();
    await registration.save();

    if (statusChanged) {
      const eventId = await nextId('PROG');
      await ProgressEvent.create({ eventId, registrationId, stage, eventType: eventType || 'STAGE_UPDATED', source: source || 'PARTNER_CRM' });
    }

    const statusLabel = subStatus ? `${stage} (${subStatus})` : stage;
    await logEvent({
      registrationId,
      eventType: statusChanged ? 'STAGE_UPDATED' : 'LEAD_DETAILS_UPDATED',
      actor: req.actorLabel,
      source: source || 'PARTNER_CRM',
      previousValue: statusChanged ? previousStage : undefined,
      newValue: { stage, subStatus, changes },
      description: statusChanged ? `Status updated to ${statusLabel}` : `Updated ${changes.length} field${changes.length === 1 ? '' : 's'}`
    });

    triggerWebhooks(req.partnerId, statusChanged ? 'STAGE_UPDATED' : 'LEAD_UPDATED', registration, customer).catch(() => {});
    if (statusChanged) planNotifications(req, registration);

    return res.json({ registrationId, currentStage: stage, subStatus, notes: registration.notes || '', scheduledAt: registration.scheduledAt || null });
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

    const { replayed, result } = await completeBooking({
      registration,
      actorLabel: req.actorLabel,
      externalEventId: req.body.externalEventId,
      afterBooked: async (booked) => {
        planNotifications(req, booked);
        const customer = await Customer.findOne({ customerId: booked.customerId });
        triggerWebhooks(booked.partnerId, 'BOOKING_COMPLETED', booked, customer).catch(() => {});
      }
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

    // Only ACTIVE users (the owner, or a team member whose status is
    // ACTIVE) can receive a lead - section 48. Unassigning ('') is always allowed.
    const { assignedTo } = req.body;
    const users = await loadAssignableUsers(req.partnerId);
    let assignedToName = '';
    if (assignedTo) {
      const user = users.find((u) => u.userId === assignedTo);
      if (!user) return res.status(400).json({ reason: 'Unknown user for this organisation', fieldKey: 'assignedTo' });
      if (user.status !== 'ACTIVE') {
        return res.status(400).json({ reason: `${user.name} is inactive - only active users can be assigned leads`, fieldKey: 'assignedTo' });
      }
      assignedToName = user.name;
    }

    const previousValue = registration.assignedTo;
    const previousName = previousValue ? users.find((u) => u.userId === previousValue)?.name || previousValue : '';
    registration.assignedTo = assignedTo || '';
    await registration.save();

    if (previousValue !== registration.assignedTo) {
      await logEvent({
        registrationId: registration.registrationId,
        eventType: 'LEAD_ASSIGNED',
        actor: req.actorLabel,
        previousValue,
        newValue: {
          assignedTo: registration.assignedTo,
          changes: [{ fieldKey: 'assignedTo', label: 'Assigned To', from: previousName, to: assignedToName || 'Unassigned' }]
        },
        description: assignedToName ? `Assigned to ${assignedToName}` : 'Unassigned'
      });
    }

    return res.json({ registrationId: registration.registrationId, assignedTo: registration.assignedTo, assignedToName });
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/my/assignable-users - owner + team members with
// status; readable by the whole team (anyone working leads needs the names).
async function listAssignableUsers(req, res, next) {
  try {
    return res.json({ users: await loadAssignableUsers(req.partnerId) });
  } catch (err) {
    next(err);
  }
}

// GET /api/channel-partner/my/lead-statuses - the partner's own status
// catalogue (section 49), readable by the whole team.
async function listLeadStatuses(req, res, next) {
  try {
    return res.json({ statuses: await listStatuses(req.partnerId) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAssignableUsers,
  listLeadStatuses,
  listMyRegistrations,
  createMyRegistration,
  getMyRegistration,
  updateMyRegistration,
  updateMyProgress,
  createMyBooking,
  getMyRegistrationAudit,
  assignRegistration
};
