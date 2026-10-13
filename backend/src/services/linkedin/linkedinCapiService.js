const crypto = require('crypto');
const LinkedInConnection = require('../../models/LinkedInConnection');
const LinkedInLead = require('../../models/LinkedInLead');
const LinkedInConversion = require('../../models/LinkedInConversion');
const Registration = require('../../models/Registration');
const { logActivity } = require('../connectorActivityService');
const { liRequest } = require('./linkedinApi');

// Conversions API (CAPI, section 59): when a lead that came from a LinkedIn
// Lead Gen Form reaches a stage the partner mapped (e.g. Qualified, Site
// Visit, Booking), LinkedIn is told - so campaign reporting shows lead
// QUALITY, not just lead count, and LinkedIn can optimise for it.
// The person is identified by the LinkedIn lead ID (no contact details
// needed) plus a SHA-256 hash of the email when there is one.

const MAX_ATTEMPTS = 5;
const BACKOFF_MIN = [1, 5, 30, 120, 720];
const MAX_EVENT_AGE_MS = 89 * 86400000; // LinkedIn accepts events up to 90 days old

const CONVERSION_TYPES = ['QUALIFIED_LEAD', 'MARKETING_QUALIFIED_LEAD', 'SALES_QUALIFIED_LEAD', 'LEAD', 'PURCHASE', 'OTHER'];

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Creates a conversion rule on the ad account (tracked across all its
// campaigns) and maps it to a Leadrat stage.
async function createConversionRule(conn, { stage, accountUrn, conversionType = 'QUALIFIED_LEAD' }) {
  const account = conn.adAccounts.find((a) => a.accountUrn === accountUrn);
  if (!account) return { error: 'Choose one of the connected ad accounts' };
  if (!stage) return { error: 'Choose a lead status' };
  if (!CONVERSION_TYPES.includes(conversionType)) return { error: 'Unknown conversion type' };

  const name = `Leadrat - ${stage}`.slice(0, 100);
  const r = await liRequest(conn, 'POST', '/conversions', {
    query: 'autoAssociationType=ALL_CAMPAIGNS',
    body: {
      name,
      account: accountUrn,
      conversionMethod: 'CONVERSIONS_API',
      type: conversionType,
      attributionType: 'LAST_TOUCH_BY_CAMPAIGN',
      postClickAttributionWindowSize: 90,
      viewThroughAttributionWindowSize: 30
    }
  });
  const id = r.headers.get('x-restli-id') || r.data?.id;
  if (!id) return { error: 'LinkedIn did not return the new conversion ID' };
  const rule = { stage, accountUrn, conversionUrn: `urn:lla:llaPartnerConversion:${id}`, conversionType, name };
  conn.settings.capiRules = [...conn.settings.capiRules.filter((x) => !(x.stage === stage && x.accountUrn === accountUrn)), rule];
  await conn.save();
  await logActivity(conn.partnerId, 'CONVERSION_RULE_CREATED', { message: `"${name}" (${conversionType}) created on ${account.name || accountUrn}`, details: rule });
  return { rule };
}

function eventBody(conv, registration) {
  const email = String(registration?.contact?.email || '').trim().toLowerCase();
  const [firstName, ...rest] = String(registration?.contact?.name || '').trim().split(/\s+/);
  const user = {
    userIds: email ? [{ idType: 'SHA256_EMAIL', idValue: sha256(email) }] : [],
    lead: `urn:li:leadGenFormResponse:${conv.leadId}`
  };
  if (firstName && rest.length) user.userInfo = { firstName, lastName: rest.join(' ') };
  return { conversion: conv.conversionUrn, conversionHappenedAt: conv.happenedAt.getTime(), user, eventId: conv.eventId };
}

async function sendConversion(conn, conv) {
  if (Date.now() - conv.happenedAt.getTime() > MAX_EVENT_AGE_MS) {
    conv.status = 'FAILED';
    conv.attempts = MAX_ATTEMPTS;
    conv.lastError = 'Older than 90 days - LinkedIn no longer accepts it';
    await conv.save();
    return;
  }
  const registration = await Registration.findOne({ registrationId: conv.registrationId, partnerId: conv.partnerId }).select('contact').lean();
  conv.attempts += 1;
  try {
    await liRequest(conn, 'POST', '/conversionEvents', { body: eventBody(conv, registration) });
    conv.status = 'SENT';
    conv.sentAt = new Date();
    conv.lastError = '';
    await logActivity(conv.partnerId, 'CONVERSION_SENT', { message: `${conv.registrationId} reached "${conv.stage}" - sent to LinkedIn`, registrationId: conv.registrationId, externalId: conv.leadId });
  } catch (err) {
    conv.status = 'FAILED';
    conv.lastError = err.message;
    conv.nextAttemptAt = new Date(Date.now() + BACKOFF_MIN[Math.min(conv.attempts - 1, BACKOFF_MIN.length - 1)] * 60000);
    await logActivity(conv.partnerId, 'CONVERSION_FAILED', {
      level: 'ERROR',
      message: `${conv.registrationId} "${conv.stage}": ${err.message}${conv.attempts < MAX_ATTEMPTS ? ' - will retry' : ' - gave up'}`,
      registrationId: conv.registrationId,
      externalId: conv.leadId
    });
  }
  await conv.save();
}

// Called for every lead event (webhookService.triggerWebhooks). Cheap exit
// unless the partner has CAPI on and the lead came from LinkedIn.
async function onLeadEvent(partnerId, eventType, registration) {
  if (!['STAGE_UPDATED', 'BOOKING_COMPLETED'].includes(eventType) || !registration?.registrationId) return;
  const conn = await LinkedInConnection.findOne({ partnerId, status: 'CONNECTED', 'settings.capiEnabled': true });
  if (!conn) return;
  const liLead = await LinkedInLead.findOne({ partnerId, registrationId: registration.registrationId, outcome: 'CREATED' }).lean();
  if (!liLead) return;
  const stage = registration.currentStage;
  const rules = conn.settings.capiRules.filter((r) => r.stage === stage);
  const rule = rules.find((r) => r.accountUrn === liLead.accountUrn) || (rules.length === 1 ? rules[0] : null);
  if (!rule) return;

  const eventId = `leadrat-${registration.registrationId}-${slug(stage)}`;
  const conv = await LinkedInConversion.findOneAndUpdate(
    { eventId },
    { $setOnInsert: { eventId, partnerId, registrationId: registration.registrationId, leadId: liLead.leadId, stage, conversionUrn: rule.conversionUrn, happenedAt: new Date() } },
    { upsert: true, new: true, includeResultMetadata: true }
  );
  // Only the first time a lead reaches the stage is reported.
  if (conv.lastErrorObject?.updatedExisting) return;
  await sendConversion(conn, conv.value);
}

// Retries failed sends (connector scheduler).
async function retryDueConversions(limit = 50) {
  const due = await LinkedInConversion.find({ status: { $in: ['PENDING', 'FAILED'] }, attempts: { $lt: MAX_ATTEMPTS }, nextAttemptAt: { $lte: new Date() } }).limit(limit);
  for (const conv of due) {
    const conn = await LinkedInConnection.findOne({ partnerId: conv.partnerId, status: 'CONNECTED' });
    if (conn) await sendConversion(conn, conv).catch(() => {});
  }
}

module.exports = { createConversionRule, onLeadEvent, retryDueConversions, eventBody, CONVERSION_TYPES };
