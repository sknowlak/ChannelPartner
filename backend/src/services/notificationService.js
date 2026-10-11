const NotificationRule = require('../models/NotificationRule');
const NotificationJob = require('../models/NotificationJob');
const Notification = require('../models/Notification');
const Registration = require('../models/Registration');
const Partner = require('../models/Partner');
const { nextId } = require('../utils/idGenerator');
const { loadOrgUsers } = require('./userDirectoryService');
const { buildLeadPayload, renderTemplate, performSend } = require('./webhookService');

const SCHEDULER_INTERVAL_MS = 30 * 1000;
const SMTP_TIMEOUT_MS = 10000;
// Jobs are sent a few at a time, so one organisation's slow webhook or
// mail server can't hold up everyone else's reminders.
const DELIVERY_CONCURRENCY = 10;
const MAX_JOBS_PER_RUN = 200;
// A job still PROCESSING after this long was abandoned by a crashed run.
const STALE_PROCESSING_MS = 5 * 60 * 1000;

// --- Timing ---------------------------------------------------------------

function shiftDate(date, amount, unit, sign) {
  const d = new Date(date);
  const n = sign * (Number(amount) || 0);
  switch (unit) {
    case 'MINUTES': d.setMinutes(d.getMinutes() + n); break;
    case 'HOURS': d.setHours(d.getHours() + n); break;
    case 'DAYS': d.setDate(d.getDate() + n); break;
    case 'WEEKS': d.setDate(d.getDate() + 7 * n); break;
    case 'MONTHS': d.setMonth(d.getMonth() + n); break;
    case 'YEARS': d.setFullYear(d.getFullYear() + n); break;
    default: break;
  }
  return d;
}

// When a rule should fire for a lead, or null if it can't (a schedule-based
// rule on a lead with no schedule).
function computeFireAt(rule, scheduledAt, now = new Date()) {
  const { mode, amount, unit } = rule.timing || {};
  if (!mode || mode === 'IMMEDIATE') return now;
  if (!scheduledAt) return null;
  if (mode === 'AT') return new Date(scheduledAt);
  return shiftDate(scheduledAt, amount, unit, mode === 'BEFORE' ? -1 : 1);
}

function ruleMatches(rule, statusName, subStatusName) {
  if (rule.trigger?.statusName && rule.trigger.statusName !== statusName) return false;
  if (rule.trigger?.subStatusName && rule.trigger.subStatusName !== subStatusName) return false;
  return true;
}

// --- Planning (called on every status / schedule change) ------------------

// Cancels the lead's still-pending reminders (they were planned for a
// status/time that's no longer current) and plans this status's rules.
// Jobs already due (IMMEDIATE, or a reminder whose time has passed) are
// processed straight away rather than waiting for the next scheduler tick.
async function planForStatusChange({ partnerId, registration, actor }) {
  const now = new Date();
  await NotificationJob.updateMany(
    { partnerId, registrationId: registration.registrationId, status: 'PENDING' },
    { status: 'CANCELLED', note: 'Superseded by a newer status update', processedAt: now }
  );

  const rules = await NotificationRule.find({ partnerId, isEnabled: true });
  const statusName = registration.currentStage;
  const subStatusName = registration.subStatus || '';
  let anyDue = false;

  for (const rule of rules) {
    if (!ruleMatches(rule, statusName, subStatusName)) continue;
    const fireAt = computeFireAt(rule, registration.scheduledAt, now);
    if (!fireAt) continue;
    // A "before the visit" reminder for a visit that's already in the past
    // is meaningless - record it as skipped instead of firing late.
    const stale = rule.timing.mode !== 'IMMEDIATE' && rule.timing.mode !== 'AFTER' && new Date(registration.scheduledAt) <= now;
    await NotificationJob.create({
      jobId: await nextId('NJOB'),
      partnerId,
      ruleId: rule.ruleId,
      registrationId: registration.registrationId,
      fireAt,
      status: stale ? 'SKIPPED' : 'PENDING',
      note: stale ? 'Scheduled time already passed when the status was set' : undefined,
      context: {
        actorUserId: actor?.userId || '',
        actorLabel: actor?.label || '',
        statusName,
        subStatusName,
        scheduledAt: registration.scheduledAt || null
      }
    });
    if (!stale && fireAt <= now) anyDue = true;
  }

  if (anyDue) processDueJobs().catch((err) => console.error('[notifications] immediate run failed', err));
}

// --- Rendering ------------------------------------------------------------

function formatInZone(date, timezone) {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone || 'UTC' }).format(new Date(date));
  } catch {
    return new Date(date).toISOString();
  }
}

// The variables a title/message can use: everything a webhook template can
// ({{customer.name}}, {{stage}}, {{customFields.x}}, ...) plus the
// notification-specific ones below. Dates render in the RECIPIENT's timezone.
function buildContentPayload({ registration, customer, partner, users, job, recipient }) {
  const base = buildLeadPayload(registration, customer, 'NOTIFICATION', partner);
  const assignee = users.find((u) => u.userId === registration.assignedTo);
  return {
    ...base,
    status: job.context.statusName,
    subStatus: job.context.subStatusName,
    schedule: { at: formatInZone(job.context.scheduledAt, recipient?.timezone) },
    assignedTo: { name: assignee?.name || 'Unassigned' },
    updatedBy: { name: job.context.actorLabel || '' },
    recipient: { name: recipient?.name || '' }
  };
}

const DEFAULT_TITLE = '{{customer.name}} - {{status}}';
const DEFAULT_MESSAGE = 'Lead {{registrationId}} ({{customer.name}}, {{customer.mobile}}) is now {{status}} {{subStatus}}.';

// --- Recipients -----------------------------------------------------------

function resolveRecipients(rule, { registration, users, job }) {
  const r = rule.recipients || {};
  const ids = new Set();
  if (r.assignedUser && registration.assignedTo) ids.add(registration.assignedTo);
  if (r.owner) ids.add(registration.partnerId);
  if (r.updatedBy && job.context.actorUserId) ids.add(job.context.actorUserId);
  for (const id of r.userIds || []) ids.add(id);
  const roleIds = new Set(r.roleIds || []);
  for (const u of users) if (u.roleId && roleIds.has(u.roleId)) ids.add(u.userId);
  // Only active users ever receive anything.
  return users.filter((u) => ids.has(u.userId) && u.status === 'ACTIVE');
}

// --- Channels -------------------------------------------------------------

let mailer;
function getMailer() {
  if (mailer !== undefined) return mailer;
  if (!process.env.SMTP_HOST) {
    mailer = null;
    return mailer;
  }
  const nodemailer = require('nodemailer');
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS
  });
  return mailer;
}

async function sendEmail(to, subject, text) {
  const transport = getMailer();
  if (!transport) return { status: 'SKIPPED', detail: 'Email not configured on the server (set SMTP_HOST etc. in backend/.env)' };
  if (!to) return { status: 'SKIPPED', detail: 'Recipient has no email address' };
  try {
    await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
    return { status: 'SENT', detail: to };
  } catch (err) {
    return { status: 'FAILED', detail: err.message };
  }
}

async function sendWebhook(rule, body) {
  if (!rule.webhook?.url) return { status: 'SKIPPED', detail: 'No webhook URL configured' };
  // Same guarded sender as integration webhooks: public addresses only,
  // redirects not followed, bounded timeout and response size.
  const out = await performSend(
    rule.webhook.url,
    'POST',
    { 'Content-Type': 'application/json', ...(rule.webhook.headers || {}) },
    JSON.stringify(body)
  );
  if (out.status === 'SUCCESS') return { status: 'SENT', detail: `HTTP ${out.httpStatus}` };
  return { status: 'FAILED', detail: out.errorMessage || `HTTP ${out.httpStatus}` };
}

// --- Delivery -------------------------------------------------------------

async function deliverJob(job) {
  const rule = await NotificationRule.findOne({ ruleId: job.ruleId, partnerId: job.partnerId });
  if (!rule || !rule.isEnabled) return { status: 'CANCELLED', note: 'Rule deleted or disabled before it fired' };

  const registration = await Registration.findOne({ registrationId: job.registrationId, partnerId: job.partnerId });
  if (!registration) return { status: 'CANCELLED', note: 'Lead no longer exists' };

  const customer = null; // contact details come from the registration itself (section 52)
  const [partner, users] = await Promise.all([
    Partner.findOne({ partnerId: job.partnerId }),
    loadOrgUsers(job.partnerId)
  ]);

  const recipients = resolveRecipients(rule, { registration, users, job });
  const deliveries = [];
  const titleTpl = rule.content?.title || DEFAULT_TITLE;
  const messageTpl = rule.content?.message || DEFAULT_MESSAGE;

  const rendered = recipients.map((recipient) => {
    const payload = buildContentPayload({ registration, customer, partner, users, job, recipient });
    return {
      recipient,
      payload,
      title: renderTemplate(titleTpl, payload).replace(/\s+/g, ' ').trim(),
      message: renderTemplate(messageTpl, payload).trim()
    };
  });

  for (const item of rendered) {
    if (rule.channels?.inApp) {
      await Notification.create({
        notificationId: await nextId('NTF'),
        partnerId: job.partnerId,
        userId: item.recipient.userId,
        ruleId: rule.ruleId,
        jobId: job.jobId,
        registrationId: registration.registrationId,
        title: item.title,
        message: item.message
      });
      deliveries.push({ channel: 'IN_APP', recipient: item.recipient.name, status: 'SENT' });
    }
    if (rule.channels?.email) {
      const out = await sendEmail(item.recipient.email, item.title, item.message);
      deliveries.push({ channel: 'EMAIL', recipient: item.recipient.name, ...out });
    }
  }

  // One webhook call per job (not per recipient), listing every recipient -
  // a WhatsApp/SMS provider fans out on its side.
  if (rule.channels?.webhook) {
    const first = rendered[0];
    const out = await sendWebhook(rule, {
      event: 'LEAD_NOTIFICATION',
      rule: { ruleId: rule.ruleId, name: rule.name },
      title: first?.title || renderTemplate(titleTpl, buildContentPayload({ registration, customer, partner, users, job })),
      message: first?.message || renderTemplate(messageTpl, buildContentPayload({ registration, customer, partner, users, job })),
      recipients: recipients.map((u) => ({ name: u.name, email: u.email, mobile: u.mobile })),
      lead: buildContentPayload({ registration, customer, partner, users, job })
    });
    deliveries.push({ channel: 'WEBHOOK', recipient: rule.webhook?.url || '', ...out });
  }

  if (recipients.length === 0 && !rule.channels?.webhook) {
    return { status: 'SKIPPED', note: 'No active recipients matched this rule', deliveries };
  }
  const anySent = deliveries.some((d) => d.status === 'SENT');
  const anyFailed = deliveries.some((d) => d.status === 'FAILED');
  return { status: anySent || !anyFailed ? 'SENT' : 'FAILED', deliveries };
}

// Only jobs abandoned for a while go back to the queue - not ones another
// backend instance is sending right now (updatedAt moves on every claim).
function requeueStaleJobs() {
  return NotificationJob.updateMany(
    { status: 'PROCESSING', updatedAt: { $lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
    { status: 'PENDING' }
  );
}

let running = false;
async function processDueJobs() {
  if (running) return;
  running = true;
  try {
    await requeueStaleJobs();
    let claimed = 0;
    const worker = async () => {
      while (claimed < MAX_JOBS_PER_RUN) {
        claimed += 1;
        // Claim atomically so overlapping runs/workers can't double-send a job.
        const job = await NotificationJob.findOneAndUpdate(
          { status: 'PENDING', fireAt: { $lte: new Date() } },
          { status: 'PROCESSING' },
          { sort: { fireAt: 1 }, new: true }
        );
        if (!job) return;
        try {
          const outcome = await deliverJob(job);
          Object.assign(job, outcome, { processedAt: new Date() });
        } catch (err) {
          Object.assign(job, { status: 'FAILED', note: err.message, processedAt: new Date() });
        }
        await job.save();
      }
    };
    await Promise.all(Array.from({ length: DELIVERY_CONCURRENCY }, worker));
  } finally {
    running = false;
  }
}

function startScheduler() {
  const tick = () => processDueJobs().catch((err) => console.error('[notifications] scheduler run failed', err));
  tick();
  return setInterval(tick, SCHEDULER_INTERVAL_MS);
}

// "Send test" from Settings: renders the rule against a real lead and
// delivers it now to the requesting user only, in-app (no email/webhook).
async function sendTest(partnerId, ruleId, registrationId, user) {
  const rule = await NotificationRule.findOne({ partnerId, ruleId });
  if (!rule) return { error: 'Rule not found' };
  const registration = await Registration.findOne({ partnerId, registrationId });
  if (!registration) return { error: 'Lead not found' };
  const customer = null; // contact details come from the registration itself (section 52)
  const [partner, users] = await Promise.all([
    Partner.findOne({ partnerId }),
    loadOrgUsers(partnerId)
  ]);
  const recipient = users.find((u) => u.userId === user.userId) || { name: user.label, timezone: 'UTC' };
  const job = { context: { statusName: registration.currentStage, subStatusName: registration.subStatus, scheduledAt: registration.scheduledAt, actorLabel: user.label, actorUserId: user.userId } };
  const payload = buildContentPayload({ registration, customer, partner, users, job, recipient });
  const title = `[Test] ${renderTemplate(rule.content?.title || DEFAULT_TITLE, payload).replace(/\s+/g, ' ').trim()}`;
  const message = renderTemplate(rule.content?.message || DEFAULT_MESSAGE, payload).trim();
  await Notification.create({ notificationId: await nextId('NTF'), partnerId, userId: user.userId, ruleId, registrationId, title, message });
  return { title, message };
}

module.exports = { planForStatusChange, processDueJobs, startScheduler, sendTest, computeFireAt, resolveRecipients, DEFAULT_TITLE, DEFAULT_MESSAGE };
