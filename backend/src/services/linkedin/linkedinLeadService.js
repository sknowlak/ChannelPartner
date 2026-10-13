const LinkedInLead = require('../../models/LinkedInLead');
const IntegrationLink = require('../../models/IntegrationLink');
const LeadFieldDefinition = require('../../models/LeadFieldDefinition');
const { invokeHandler } = require('../../utils/invokeHandler');
const { logActivity } = require('../connectorActivityService');
const { liRequest, enc, idOf, campaignNames } = require('./linkedinApi');

// LinkedIn Lead Gen Form submissions -> Leadrat leads (section 59).
// Leads go through the same createMyRegistration handler as every other
// lead (validation, duplicate protection, audit history, notifications,
// webhooks). A lead needs a name and a phone number; LinkedIn forms
// without a phone question produce "rejected - no phone" entries in the
// activity log so the partner can fix the form.

const LEAD_SOURCE = 'LinkedIn';
const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const FIRST_SYNC_DAYS = 30; // how far back the first sync looks
const OVERLAP_MS = 60 * 60 * 1000; // re-read the last hour each run (late-arriving leads)
const MAX_ATTEMPTS = 5;

function leadHandlers() {
  return require('../../controllers/myLeadsController'); // eslint-disable-line global-require
}

const connectorIdFor = (partnerId) => `LINKEDIN:${partnerId}`;

// urn:li:versionedLeadGenForm:(urn:li:leadGenForm:3162,1) -> 3162
function formIdOf(urn) {
  const m = String(urn || '').match(/leadGenForm:(\d+)/);
  return m ? m[1] : '';
}

// The text of one answer: free text, or the chosen option labels.
function answerText(answer, question) {
  const d = answer?.answerDetails || {};
  if (d.textQuestionAnswer) return String(d.textQuestionAnswer.answer ?? '').trim();
  const picked = d.multipleChoiceAnswer?.options || [];
  if (picked.length) {
    const opts = question?.questionDetails?.multipleChoiceQuestionDetails?.options || [];
    return picked.map((id) => opts.find((o) => o.id === id)?.text?.localized?.en_US || opts.find((o) => o.id === id)?.text || String(id)).join(', ');
  }
  return '';
}

const localized = (v) => (v && typeof v === 'object' ? v.localized?.en_US || Object.values(v.localized || {})[0] || '' : v || '');

// One LinkedIn lead + its form -> createMyRegistration body (or a reason it
// can't become a lead). Pure: unit-tested in tests/linkedinConnector.test.js.
function mapLinkedInLead(lead, form, { defaultCountry = 'IN', formName = '', campaignName = '' } = {}) {
  const questions = new Map((form?.content?.questions || []).map((q) => [q.questionId, q]));
  const byField = {};
  const extra = [];
  for (const a of lead?.formResponse?.answers || []) {
    const q = questions.get(a.questionId);
    const text = answerText(a, q);
    if (!text) continue;
    const field = q?.predefinedField;
    if (field && byField[field] === undefined) byField[field] = text;
    else extra.push(`${localized(q?.question) || q?.name || `Question ${a.questionId}`}: ${text}`);
  }

  const name = [byField.FIRST_NAME, byField.LAST_NAME].filter(Boolean).join(' ').trim();
  const phones = [byField.PHONE_NUMBER, byField.WORK_PHONE_NUMBER].filter(Boolean);
  const email = byField.EMAIL || byField.WORK_EMAIL || '';
  if (!name) return { error: 'The form answers have no name' };
  if (!phones.length) return { error: 'The form has no phone number - add a phone question to the LinkedIn form' };

  // A number already in +country format carries its own country; a bare
  // national number is read as the connection's default country.
  const isNational = (raw) => !/^\s*(\+|00)/.test(raw);
  const customer = { name, mobile: phones[0] };
  if (isNational(phones[0])) customer.mobileCountry = defaultCountry;
  if (phones[1] && phones[1] !== phones[0]) {
    customer.alternateMobile = phones[1];
    if (isNational(phones[1])) customer.alternateMobileCountry = defaultCountry;
  }
  if (email) customer.email = email;

  const notes = [
    `LinkedIn Lead Gen Form${formName ? `: ${formName}` : ''}`,
    campaignName ? `Campaign: ${campaignName}` : '',
    lead.testLead ? 'Test lead (generated in Campaign Manager)' : '',
    ...extra
  ].filter(Boolean).join('\n');

  const body = {
    customer,
    leadSource: LEAD_SOURCE,
    subSource: formName || undefined,
    campaignNames: campaignName ? [campaignName] : undefined,
    companyName: byField.COMPANY_NAME || undefined,
    designation: byField.JOB_TITLE || undefined,
    customerLocation: [byField.CITY, byField.STATE, byField.COUNTRY].filter(Boolean).join(', ') || undefined,
    notes
  };
  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);
  return { body };
}

// Partners' "Source" dropdown is their own data; add "LinkedIn" to it once
// so imported leads keep the value (a value that isn't an option is dropped).
async function ensureLeadSourceOption(partnerId) {
  await LeadFieldDefinition.updateOne(
    { partnerId, fieldKey: 'leadSource', dataType: 'SELECT', options: { $ne: LEAD_SOURCE } },
    { $push: { options: LEAD_SOURCE } }
  ).catch(() => {});
}

// Per-sync cache of forms and campaign names (one API call each).
function makeLookups(conn) {
  const forms = new Map();
  const campaigns = new Map();
  return {
    async form(versionedUrn) {
      const id = formIdOf(versionedUrn);
      if (!id) return null;
      if (!forms.has(id)) {
        forms.set(id, liRequest(conn, 'GET', `/leadForms/${id}`).then((r) => r.data).catch(() => null));
      }
      return forms.get(id);
    },
    async campaignName(accountUrn, campaignUrn) {
      if (!campaignUrn) return '';
      if (!campaigns.has(accountUrn)) campaigns.set(accountUrn, campaignNames(conn, accountUrn).catch(() => new Map()));
      return (await campaigns.get(accountUrn)).get(campaignUrn) || '';
    }
  };
}

const ACTIVITY_FOR = { CREATED: 'LEAD_CREATED', DUPLICATE: 'LEAD_DUPLICATE', REJECTED: 'LEAD_REJECTED', FAILED: 'LEAD_FAILED' };

// Imports one LinkedIn lead (skips leads already handled; retries failures).
async function importLead(conn, lead, accountUrn, lookups) {
  const leadId = String(lead.id || '');
  if (!leadId) return null;
  const existing = await LinkedInLead.findOne({ partnerId: conn.partnerId, leadId });
  if (existing && (existing.outcome !== 'FAILED' || existing.attempts >= MAX_ATTEMPTS)) return null;

  const form = await lookups.form(lead.versionedLeadGenFormUrn);
  const campaignUrn = lead.leadMetadata?.sponsoredLeadMetadata?.campaign || '';
  const campaignName = await lookups.campaignName(accountUrn, campaignUrn);
  const formName = form?.name || '';
  const mapped = mapLinkedInLead(lead, form, { defaultCountry: conn.settings.defaultCountry, formName, campaignName });

  let outcome;
  let message = '';
  let registrationId = '';
  if (mapped.error) {
    outcome = 'REJECTED';
    message = mapped.error;
  } else {
    const r = await invokeHandler(leadHandlers().createMyRegistration, {
      partnerId: conn.partnerId,
      actorLabel: 'LinkedIn Lead Sync',
      body: { ...mapped.body, source: 'LINKEDIN', externalReferenceId: `LINKEDIN:${leadId}` },
      extra: { integrationImport: true }
    }).catch((err) => ({ status: 500, data: { reason: err.message } }));
    if (r.status === 201 || r.status === 200) {
      outcome = 'CREATED';
      registrationId = r.data.registrationId;
    } else if (r.status === 409 && r.data?.reasonCode === 'DUPLICATE_PROTECTED') {
      outcome = 'DUPLICATE';
      message = `Customer is already protected until ${new Date(r.data.protectedUntil).toISOString().slice(0, 10)}`;
    } else if (r.status === 400) {
      outcome = 'REJECTED';
      message = r.data?.reason || 'Invalid lead';
    } else {
      outcome = 'FAILED';
      message = r.data?.reason || `HTTP ${r.status}`;
    }
  }

  const record = {
    accountUrn, campaignUrn, campaignName, creativeUrn: lead.associatedEntity?.associatedCreative || '',
    formUrn: lead.versionedLeadGenFormUrn || '', formName, leadType: lead.leadType || 'SPONSORED', testLead: Boolean(lead.testLead),
    submittedAt: new Date(Number(lead.submittedAt) || Date.now()), outcome, message, registrationId
  };
  await LinkedInLead.findOneAndUpdate(
    { partnerId: conn.partnerId, leadId },
    { $set: record, $inc: { attempts: existing ? 1 : 0 }, $setOnInsert: { partnerId: conn.partnerId, leadId } },
    { upsert: true }
  );
  if (registrationId) {
    await IntegrationLink.findOneAndUpdate(
      { connectorId: connectorIdFor(conn.partnerId), externalId: leadId },
      { $set: { partnerId: conn.partnerId, registrationId } },
      { upsert: true }
    ).catch(() => {});
  }
  const who = mapped.body?.customer?.name || 'LinkedIn lead';
  await logActivity(conn.partnerId, ACTIVITY_FOR[outcome], {
    level: outcome === 'CREATED' ? 'INFO' : outcome === 'DUPLICATE' ? 'WARNING' : 'ERROR',
    message: outcome === 'CREATED' ? `${who} created as ${registrationId}` : `${who}: ${message}`,
    registrationId,
    externalId: leadId,
    details: { formName, campaignName, submittedAt: record.submittedAt, testLead: record.testLead }
  });
  return outcome;
}

// Fetches and imports leads for every enabled ad account. Without `range`:
// leads submitted since the last sync, and the sync window moves forward
// only when every account succeeded. With `range` ({ start, end } in ms -
// daily catch-up or a partner's "fetch by date range"): exactly that
// window, without moving the regular sync window. Leads already imported
// are skipped either way.
async function syncLeads(conn, range = null) {
  const counts = { received: 0, CREATED: 0, DUPLICATE: 0, REJECTED: 0, FAILED: 0, skipped: 0 };
  const end = range ? range.end : Date.now();
  const start = range ? range.start
    : conn.leadsSyncedUntil ? conn.leadsSyncedUntil.getTime() - OVERLAP_MS : end - FIRST_SYNC_DAYS * 86400000;
  const lookups = makeLookups(conn);
  await ensureLeadSourceOption(conn.partnerId);

  const errors = [];
  for (const account of conn.adAccounts.filter((a) => a.enabled)) {
    const kinds = conn.settings.includeTestLeads ? [false, true] : [false];
    try {
      for (const testOnly of kinds) {
        for (let page = 0; page < MAX_PAGES; page++) {
          const query = `q=owner&owner=(sponsoredAccount:${enc(account.accountUrn)})&leadType=(leadType:SPONSORED)`
            + `&limitedToTestLeads=${testOnly}&submittedAtTimeRange=(start:${start},end:${end})&start=${page * PAGE_SIZE}&count=${PAGE_SIZE}`;
          const r = await liRequest(conn, 'GET', '/leadFormResponses', { query });
          const elements = r.data?.elements || [];
          for (const lead of elements) {
            counts.received += 1;
            const outcome = await importLead(conn, lead, account.accountUrn, lookups);
            if (outcome) counts[outcome] += 1; else counts.skipped += 1;
          }
          if (elements.length < PAGE_SIZE) break;
        }
      }
    } catch (err) {
      if (err.needsReconnect) throw err;
      errors.push(`${account.name || account.accountUrn}: ${err.message}`);
    }
  }
  if (!errors.length && !range) conn.leadsSyncedUntil = new Date(end);
  return { counts, errors };
}

// One lead by ID (webhook notifications carry only the ID).
async function importLeadById(conn, leadUrnOrId, accountUrn) {
  const r = await liRequest(conn, 'GET', `/leadFormResponses/${enc(idOf(leadUrnOrId))}`);
  await ensureLeadSourceOption(conn.partnerId);
  return importLead(conn, r.data, accountUrn, makeLookups(conn));
}

module.exports = { mapLinkedInLead, syncLeads, importLeadById, ensureLeadSourceOption, formIdOf, connectorIdFor, LEAD_SOURCE };
