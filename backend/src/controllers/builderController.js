const Registration = require('../models/Registration');
const Booking = require('../models/Booking');
const Project = require('../models/Project');
const Partner = require('../models/Partner');
const BuilderUser = require('../models/BuilderUser');
const { verifyPassword, hashPassword, passwordProblem } = require('../services/partnerAuthService');
const { issueToken } = require('../services/builderAuthService');
const { getOwnership } = require('../services/ownershipService');
const { buildBuilderView } = require('../services/visibilityService');
const { completeBooking } = require('../services/bookingService');
const { logEvent, getTimeline } = require('../services/auditService');
const { triggerWebhooks } = require('../services/webhookService');
const { projectIdsForBuilder } = require('../services/projectService');
const { contactView } = require('../utils/contact');

// The builder portal (section 52). A builder sees and acts on referrals for
// its OWN projects only; anything else answers 404, exactly like a missing
// record, so IDs can't be probed. Builders can accept/reject a referral and
// confirm the booking - they can never change the source partner, the
// duplicate decision, or the partner's own lead data.

const MAX_PAGE = 200;

async function loadScopedReferral(req) {
  const projectIds = await projectIdsForBuilder(req.builder.builderId);
  return Registration.findOne({
    registrationId: String(req.params.registrationId),
    projectId: { $in: projectIds },
    referralStatus: { $ne: 'NOT_REFERRED' }
  });
}

async function referralView(registration) {
  const [ownership, booking, partner, project] = await Promise.all([
    getOwnership(registration.registrationId),
    Booking.findOne({ registrationId: registration.registrationId }),
    Partner.findOne({ partnerId: registration.partnerId }),
    Project.findOne({ projectId: registration.projectId })
  ]);
  // Contact fields follow the field-sharing table (section 10): e.g. mobile
  // and email only after booking. Source partner is always shown - it is
  // the attribution the builder must honour.
  const view = await buildBuilderView({ registration, customer: contactView(registration), ownership, booking });
  return {
    ...view,
    projectName: project?.name || registration.projectId,
    sourcePartner: { partnerId: registration.partnerId, name: partner?.companyName || partner?.name || registration.partnerId },
    referralStatus: registration.referralStatus,
    referralDecision: registration.referralDecision || null,
    registeredAt: registration.registeredAt,
    isBooked: !!registration.isBooked
  };
}

// POST /api/builder/auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ reason: 'email and password are required' });
    const user = await BuilderUser.findOne({ email: String(email).toLowerCase().trim() });
    // Same answer for unknown email and wrong password (no account probing).
    if (!user || !(await verifyPassword(String(password), user.passwordHash))) return res.status(401).json({ reason: 'Invalid credentials' });
    if (user.status !== 'ACTIVE') return res.status(403).json({ reason: 'This builder account is deactivated' });
    user.lastLoginAt = new Date();
    await user.save();
    return res.json({ token: issueToken(user), user: { builderUserId: user.builderUserId, builderId: user.builderId, name: user.name, email: user.email } });
  } catch (err) {
    next(err);
  }
}

// GET /api/builder/me
async function me(req, res) {
  const u = req.builderUser;
  return res.json({ builder: req.builder, user: { builderUserId: u.builderUserId, name: u.name, email: u.email } });
}

// PATCH /api/builder/me/password { currentPassword, password }
async function changePassword(req, res, next) {
  try {
    const user = req.builderUser;
    if (!req.body.currentPassword || !(await verifyPassword(String(req.body.currentPassword), user.passwordHash))) {
      return res.status(400).json({ reason: 'Current password is incorrect', fieldKey: 'currentPassword' });
    }
    const problem = passwordProblem(req.body.password);
    if (problem) return res.status(400).json({ reason: problem, fieldKey: 'password' });
    user.passwordHash = await hashPassword(req.body.password);
    user.passwordChangedAt = new Date();
    await user.save();
    return res.json({ ok: true, token: issueToken(user) });
  } catch (err) {
    next(err);
  }
}

// GET /api/builder/projects
async function listProjects(req, res, next) {
  try {
    const projects = await Project.find({ builderId: req.builder.builderId }).sort({ name: 1 });
    return res.json({ projects });
  } catch (err) {
    next(err);
  }
}

// GET /api/builder/referrals?projectId=&referralStatus=&page=&limit=
async function listReferrals(req, res, next) {
  try {
    const own = await projectIdsForBuilder(req.builder.builderId);
    const filter = { projectId: { $in: own }, referralStatus: { $ne: 'NOT_REFERRED' } };
    if (req.query.projectId) {
      const wanted = String(req.query.projectId);
      if (!own.includes(wanted)) return res.json({ page: 1, limit: 0, total: 0, referrals: [] });
      filter.projectId = wanted;
    }
    if (req.query.referralStatus) filter.referralStatus = String(req.query.referralStatus);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(req.query.limit) || 50));

    const [total, regs] = await Promise.all([
      Registration.countDocuments(filter),
      Registration.find(filter).sort({ registeredAt: -1 }).skip((page - 1) * limit).limit(limit)
    ]);
    const referrals = await Promise.all(regs.map(referralView));
    return res.json({ page, limit, total, referrals });
  } catch (err) {
    next(err);
  }
}

// GET /api/builder/referrals/:registrationId
async function getReferral(req, res, next) {
  try {
    const registration = await loadScopedReferral(req);
    if (!registration) return res.status(404).json({ reason: 'Referral not found' });
    return res.json(await referralView(registration));
  } catch (err) {
    next(err);
  }
}

// POST /api/builder/referrals/:registrationId/decision { decision: ACCEPT | REJECT, reason }
async function decideReferral(req, res, next) {
  try {
    const decision = String(req.body.decision || '').toUpperCase();
    if (!['ACCEPT', 'REJECT'].includes(decision)) return res.status(400).json({ reason: 'decision must be ACCEPT or REJECT' });
    const reason = String(req.body.reason || '').trim().slice(0, 500);
    if (decision === 'REJECT' && !reason) return res.status(400).json({ reason: 'A reason is required to reject a referral', fieldKey: 'reason' });

    const registration = await loadScopedReferral(req);
    if (!registration) return res.status(404).json({ reason: 'Referral not found' });
    if (registration.isBooked) return res.status(409).json({ reason: 'This referral is already booked' });

    // Atomic: two builder users deciding at once can't both win.
    const nextStatus = decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
    const updated = await Registration.findOneAndUpdate(
      { registrationId: registration.registrationId, isBooked: { $ne: true }, referralStatus: registration.referralStatus },
      { $set: { referralStatus: nextStatus, referralDecision: { decidedBy: req.actorLabel, decidedAt: new Date(), reason } } },
      { new: true }
    );
    if (!updated) return res.status(409).json({ reason: 'This referral was just changed by someone else - reload and try again' });

    await logEvent({
      registrationId: registration.registrationId,
      eventType: decision === 'ACCEPT' ? 'REFERRAL_ACCEPTED' : 'REFERRAL_REJECTED',
      actor: req.actorLabel,
      previousValue: registration.referralStatus,
      newValue: nextStatus,
      description: decision === 'ACCEPT' ? 'Builder accepted the referral' : `Builder rejected the referral. Reason: ${reason}`
    });
    triggerWebhooks(updated.partnerId, 'STAGE_UPDATED', updated).catch(() => {});
    return res.json(await referralView(updated));
  } catch (err) {
    next(err);
  }
}

// POST /api/builder/referrals/:registrationId/booking { externalEventId? }
// The responsibility-transfer event (section 13) - see bookingService.
async function bookReferral(req, res, next) {
  try {
    const registration = await loadScopedReferral(req);
    if (!registration) return res.status(404).json({ reason: 'Referral not found' });

    const { replayed, result } = await completeBooking({
      registration,
      actorLabel: req.actorLabel,
      externalEventId: req.body.externalEventId,
      afterBooked: (booked) => triggerWebhooks(booked.partnerId, 'BOOKING_COMPLETED', booked)
    });
    return res.status(replayed ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/builder/referrals/:registrationId/audit
// What happened, when, and by whom at organization level - without the
// partner's internal field values or staff names.
async function getReferralAudit(req, res, next) {
  try {
    const registration = await loadScopedReferral(req);
    if (!registration) return res.status(404).json({ reason: 'Referral not found' });
    const events = await getTimeline(registration.registrationId);
    const actorType = (actor) => {
      if (!actor || actor === 'SYSTEM') return 'System';
      if (/\(Builder:/.test(actor)) return actor;
      if (/^ADMIN:/.test(actor)) return 'Leadrat admin';
      return 'Channel partner';
    };
    return res.json({
      registrationId: registration.registrationId,
      events: events.map((e) => ({ eventType: e.eventType, timestamp: e.timestamp, actor: actorType(e.actor), description: e.description }))
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, me, changePassword, listProjects, listReferrals, getReferral, decideReferral, bookReferral, getReferralAudit };
