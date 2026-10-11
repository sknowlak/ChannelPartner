const NotificationRule = require('../models/NotificationRule');
const NotificationJob = require('../models/NotificationJob');
const Notification = require('../models/Notification');
const { nextId } = require('../utils/idGenerator');
const { sendTest } = require('../services/notificationService');
const { outboundUrlProblem } = require('../utils/outboundUrl');
const { maskHeaders, headersProblem } = require('../utils/secretHeaders');
const { PERMISSIONS } = require('../config/permissions');

const MODES = ['IMMEDIATE', 'BEFORE', 'AT', 'AFTER'];
const UNITS = ['MINUTES', 'HOURS', 'DAYS', 'WEEKS', 'MONTHS', 'YEARS'];
// Caps that keep one organisation from turning a single status change into
// thousands of emails/in-app rows (and getting the SMTP account blacklisted).
const MAX_RULES_PER_PARTNER = 50;
const MAX_EXPLICIT_RECIPIENTS = 100;
const MAX_TEMPLATE_LENGTH = 4000;

// The logged-in user's id in the Notification/assignedTo id space.
function currentUserId(req) {
  return req.memberId || req.partnerId;
}

function sanitizeRule(body) {
  const timing = body.timing || {};
  const mode = MODES.includes(timing.mode) ? timing.mode : 'IMMEDIATE';
  const r = body.recipients || {};
  const c = body.channels || {};
  return {
    name: String(body.name || '').trim(),
    isEnabled: body.isEnabled !== false,
    trigger: { statusName: String(body.trigger?.statusName || ''), subStatusName: String(body.trigger?.subStatusName || '') },
    timing: {
      mode,
      amount: mode === 'BEFORE' || mode === 'AFTER' ? Math.max(0, Number(timing.amount) || 0) : 0,
      unit: UNITS.includes(timing.unit) ? timing.unit : 'MINUTES'
    },
    recipients: {
      assignedUser: !!r.assignedUser,
      owner: !!r.owner,
      updatedBy: !!r.updatedBy,
      roleIds: Array.isArray(r.roleIds) ? r.roleIds.map(String).slice(0, MAX_EXPLICIT_RECIPIENTS) : [],
      userIds: Array.isArray(r.userIds) ? r.userIds.map(String).slice(0, MAX_EXPLICIT_RECIPIENTS) : []
    },
    channels: { inApp: !!c.inApp, email: !!c.email, webhook: !!c.webhook },
    webhook: {
      url: String(body.webhook?.url || '').trim(),
      headers: body.webhook?.headers && typeof body.webhook.headers === 'object' ? body.webhook.headers : {}
    },
    content: {
      title: String(body.content?.title || '').slice(0, 300),
      message: String(body.content?.message || '').slice(0, MAX_TEMPLATE_LENGTH)
    }
  };
}

async function validateRule(rule) {
  if (!rule.name) return 'Rule name is required';
  if (!rule.channels.inApp && !rule.channels.email && !rule.channels.webhook) return 'Pick at least one channel (In-app, Email or Webhook)';
  const r = rule.recipients;
  if (!rule.channels.webhook && !r.assignedUser && !r.owner && !r.updatedBy && r.roleIds.length === 0 && r.userIds.length === 0) {
    return 'Pick at least one recipient';
  }
  if (rule.channels.webhook) {
    const urlProblem = await outboundUrlProblem(rule.webhook.url);
    if (urlProblem) return `Webhook URL: ${urlProblem}`;
    const badHeaders = headersProblem(rule.webhook.headers);
    if (badHeaders) return `Webhook ${badHeaders}`;
  }
  if ((rule.timing.mode === 'BEFORE' || rule.timing.mode === 'AFTER') && !(rule.timing.amount > 0)) return 'Enter how long before/after the scheduled time';
  return null;
}

// --- Rules (Settings -> Lead -> Notifications) ----------------------------

async function listRules(req, res, next) {
  try {
    const rules = await NotificationRule.find({ partnerId: req.partnerId }).sort({ createdAt: 1 });
    // Webhook header values (provider credentials) only in full for people
    // who can edit rules; everyone else gets them masked.
    if ((req.permissions || []).includes(PERMISSIONS.MANAGE_SETTINGS)) return res.json({ rules });
    const masked = rules.map((r) => {
      const obj = r.toObject();
      if (obj.webhook) obj.webhook.headers = maskHeaders(obj.webhook.headers);
      return obj;
    });
    return res.json({ rules: masked });
  } catch (err) {
    next(err);
  }
}

async function createRule(req, res, next) {
  try {
    const rule = sanitizeRule(req.body);
    const error = await validateRule(rule);
    if (error) return res.status(400).json({ reason: error });
    const existingCount = await NotificationRule.countDocuments({ partnerId: req.partnerId });
    if (existingCount >= MAX_RULES_PER_PARTNER) {
      return res.status(400).json({ reason: `You can have at most ${MAX_RULES_PER_PARTNER} notification rules` });
    }
    const created = await NotificationRule.create({ ...rule, ruleId: await nextId('NRULE'), partnerId: req.partnerId });
    return res.status(201).json({ rule: created });
  } catch (err) {
    next(err);
  }
}

async function updateRule(req, res, next) {
  try {
    const existing = await NotificationRule.findOne({ partnerId: req.partnerId, ruleId: req.params.ruleId });
    if (!existing) return res.status(404).json({ reason: 'Rule not found' });
    // Toggling enabled from the list sends only { isEnabled }.
    const merged = Object.keys(req.body).length === 1 && 'isEnabled' in req.body
      ? { ...existing.toObject(), isEnabled: !!req.body.isEnabled }
      : req.body;
    const rule = sanitizeRule(merged);
    const error = await validateRule(rule);
    if (error) return res.status(400).json({ reason: error });
    Object.assign(existing, rule);
    await existing.save();
    return res.json({ rule: existing });
  } catch (err) {
    next(err);
  }
}

async function deleteRule(req, res, next) {
  try {
    const result = await NotificationRule.deleteOne({ partnerId: req.partnerId, ruleId: req.params.ruleId });
    if (result.deletedCount === 0) return res.status(404).json({ reason: 'Rule not found' });
    await NotificationJob.updateMany({ partnerId: req.partnerId, ruleId: req.params.ruleId, status: 'PENDING' }, { status: 'CANCELLED', note: 'Rule deleted' });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function testRule(req, res, next) {
  try {
    const out = await sendTest(req.partnerId, req.params.ruleId, req.body.registrationId, { userId: currentUserId(req), label: req.actorLabel });
    if (out.error) return res.status(400).json({ reason: out.error });
    return res.json(out);
  } catch (err) {
    next(err);
  }
}

// Planned + past sends, newest first - "where did my reminder go?"
async function listJobs(req, res, next) {
  try {
    const filter = { partnerId: req.partnerId };
    if (req.query.ruleId) filter.ruleId = String(req.query.ruleId);
    if (req.query.status) filter.status = String(req.query.status);
    const jobs = await NotificationJob.find(filter).sort({ fireAt: -1 }).limit(200);
    return res.json({ jobs });
  } catch (err) {
    next(err);
  }
}

// --- My inbox (bell) ------------------------------------------------------

async function listMine(req, res, next) {
  try {
    const userId = currentUserId(req);
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ partnerId: req.partnerId, userId }).sort({ createdAt: -1 }).limit(50),
      Notification.countDocuments({ partnerId: req.partnerId, userId, readAt: null })
    ]);
    return res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const filter = { partnerId: req.partnerId, userId: currentUserId(req), readAt: null };
    if (req.params.notificationId !== 'all') filter.notificationId = String(req.params.notificationId);
    await Notification.updateMany(filter, { readAt: new Date() });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listRules, createRule, updateRule, deleteRule, testRule, listJobs, listMine, markRead, currentUserId };
