const IntegrationLink = require('../models/IntegrationLink');
const InboundEvent = require('../models/InboundEvent');
const Registration = require('../models/Registration');
const { nextId } = require('../utils/idGenerator');
const { getPath } = require('../utils/jsonPath');
const { invokeHandler } = require('../utils/invokeHandler');
const { listFieldDefinitions } = require('./leadFieldDefinitionService');

// Turns records in ANOTHER system's format into leads (section 51) - shared
// by RECEIVE sources (they call our URL) and PULL sources (we call their
// API). Each record is mapped field-by-field using the source's mapping,
// then created - or, when the sender's own ID was seen before, updated -
// through the same handlers the web app uses.

const MAX_RECORDS_PER_REQUEST = 200;
const MAX_STORED_RECORD_CHARS = 20000;
const STATUS_KEYS = ['stage', 'subStatus'];

// The handlers are required lazily: myLeadsController -> webhookService ->
// ... would otherwise form a require cycle through this module.
function leadHandlers() {
  return require('../controllers/myLeadsController'); // eslint-disable-line global-require
}

function extractRecords(source, body) {
  if (source.recordsPath) {
    const found = getPath(body, source.recordsPath);
    if (Array.isArray(found)) return found;
    return found && typeof found === 'object' ? [found] : [];
  }
  if (Array.isArray(body)) return body;
  return body && typeof body === 'object' ? [body] : [];
}

function mapStatus(source, value) {
  const hit = (source.statusMap || []).find((m) => String(m.from).trim().toLowerCase() === String(value).trim().toLowerCase());
  return hit ? hit.to : String(value);
}

// Shapes a raw value for the target field: lists stay lists for LIST
// fields and are comma-joined otherwise; objects are not imported. Dropdown
// (SELECT) values are matched to the field's options ignoring case/spacing;
// a value that matches no option is dropped (the caller records a warning)
// rather than failing the whole lead over one field.
const SKIP = Symbol('skip');
const norm = (v) => String(v).trim().toLowerCase().replace(/[\s_-]+/g, ' ');

function shapeValue(value, def) {
  if (def?.dataType === 'SELECT' && def.options?.length && value !== null && typeof value !== 'object') {
    const hit = def.options.find((o) => norm(o) === norm(value));
    return hit === undefined ? SKIP : hit;
  }
  if (Array.isArray(value)) {
    const items = value.filter((v) => v !== null && typeof v !== 'object').map(String);
    return def?.dataType === 'LIST' ? items : items.join(', ');
  }
  if (value !== null && typeof value === 'object') return undefined;
  if (typeof value === 'boolean' && def?.dataType !== 'BOOLEAN') return String(value);
  return value;
}

// { customer, fields, stage, subStatus, warnings } for one record.
function mapRecord(source, record, defsByKey) {
  const out = { customer: {}, fields: {}, stage: '', subStatus: '', warnings: [] };
  for (const row of source.mapping || []) {
    const raw = row.source === 'FIXED' ? row.value : getPath(record, row.path);
    if (raw === undefined || raw === null || raw === '') continue;

    if (STATUS_KEYS.includes(row.fieldKey)) {
      out[row.fieldKey] = row.fieldKey === 'stage' ? mapStatus(source, raw) : String(raw);
      continue;
    }
    const def = defsByKey[row.fieldKey];
    if (!def) continue;
    const value = shapeValue(raw, def);
    if (value === SKIP) {
      out.warnings.push(`"${raw}" is not an option for ${def.label} - left empty`);
      continue;
    }
    if (value === undefined || value === '') continue;
    if (def.scope === 'customer') out.customer[row.fieldKey] = value;
    else out.fields[row.fieldKey] = value;
  }
  return out;
}

function capForStorage(value) {
  try {
    const text = JSON.stringify(value);
    if (text.length <= MAX_STORED_RECORD_CHARS) return value;
    return { truncated: true, preview: text.slice(0, MAX_STORED_RECORD_CHARS) };
  } catch {
    return null;
  }
}

function externalIdOf(source, record) {
  if (!source.externalIdPath) return '';
  const value = getPath(record, source.externalIdPath);
  return value === undefined || value === null || typeof value === 'object' ? '' : String(value).slice(0, 200);
}

async function logEvent(source, { externalId, outcome, registrationId = '', message = '', record, mapped }) {
  await InboundEvent.create({
    eventId: await nextId('INB'),
    partnerId: source.partnerId,
    sourceId: source.sourceId,
    externalId,
    outcome,
    registrationId,
    message: String(message || '').slice(0, 1000),
    record: capForStorage(record),
    mapped: capForStorage(mapped)
  }).catch((err) => console.error('[integrations] could not log inbound event', err));
}

async function applyStatus(ctx, registrationId, mapped) {
  if (!mapped.stage) return null;
  const r = await invokeHandler(leadHandlers().updateMyProgress, {
    ...ctx,
    params: { registrationId },
    body: { stage: mapped.stage, subStatus: mapped.subStatus || undefined, source: 'INTEGRATION_CONNECTOR' },
    extra: { integrationImport: true }
  });
  return r.status >= 400 ? r.data?.reason || `HTTP ${r.status}` : null;
}

async function updateExisting(source, ctx, link, mapped) {
  const body = { ...mapped.fields, ...mapped.customer };
  if (mapped.customer.mobile) body.mobileCountry = source.defaultCountry;
  if (mapped.customer.alternateMobile) body.alternateMobileCountry = source.defaultCountry;

  const edit = await invokeHandler(leadHandlers().updateMyRegistration, {
    ...ctx,
    params: { registrationId: link.registrationId },
    body,
    extra: { integrationImport: true }
  });
  if (edit.status >= 400) return { outcome: 'FAILED', message: edit.data?.reason || `HTTP ${edit.status}` };
  const statusError = await applyStatus(ctx, link.registrationId, mapped);
  if (statusError) return { outcome: 'FAILED', message: `Updated fields, but status: ${statusError}` };
  return { outcome: 'UPDATED' };
}

async function createNew(source, ctx, externalId, mapped) {
  const customer = { ...mapped.customer, mobileCountry: source.defaultCountry };
  if (customer.alternateMobile) customer.alternateMobileCountry = source.defaultCountry;

  const created = await invokeHandler(leadHandlers().createMyRegistration, {
    ...ctx,
    body: {
      ...mapped.fields,
      customer,
      source: 'INTEGRATION_CONNECTOR',
      // Same record sent twice at once still creates one lead (idempotency).
      externalReferenceId: externalId ? `${source.sourceId}:${externalId}` : undefined
    },
    extra: { integrationImport: true }
  });

  if (created.status === 409 && created.data?.reasonCode === 'DUPLICATE_PROTECTED') {
    return { outcome: 'DUPLICATE', message: `Customer is already protected until ${String(created.data.protectedUntil || '').slice(0, 10)}` };
  }
  if (created.status >= 400) return { outcome: 'FAILED', message: created.data?.reason || `HTTP ${created.status}` };

  const { registrationId } = created.data;
  if (externalId) {
    await IntegrationLink.findOneAndUpdate(
      { connectorId: source.sourceId, externalId },
      { $set: { partnerId: source.partnerId, registrationId } },
      { upsert: true }
    ).catch(() => {});
  }
  const statusError = await applyStatus(ctx, registrationId, mapped);
  return { outcome: 'CREATED', registrationId, message: statusError ? `Created, but status: ${statusError}` : '' };
}

async function importRecord(source, record, ctx, defsByKey) {
  const externalId = externalIdOf(source, record);
  let mapped = null;
  let result;
  try {
    mapped = mapRecord(source, record, defsByKey);
    const link = externalId ? await IntegrationLink.findOne({ connectorId: source.sourceId, externalId }) : null;
    const stillExists = link && (await Registration.exists({ registrationId: link.registrationId, partnerId: source.partnerId }));

    if (stillExists) {
      result = source.updateExisting
        ? { registrationId: link.registrationId, ...(await updateExisting(source, ctx, link, mapped)) }
        : { outcome: 'UNCHANGED', registrationId: link.registrationId, message: 'Already imported (updates are switched off for this source)' };
    } else {
      if (!mapped.customer.name || !mapped.customer.mobile) {
        result = { outcome: 'REJECTED', message: 'Record has no name or mobile after mapping - check the field mapping' };
      } else {
        result = await createNew(source, ctx, externalId, mapped);
      }
    }
  } catch (err) {
    result = { outcome: 'FAILED', message: err.message };
  }
  if (mapped?.warnings?.length) {
    result.message = [result.message, ...mapped.warnings].filter(Boolean).join('; ');
  }

  await logEvent(source, { externalId, record, mapped, ...result });
  return { externalId, ...result };
}

// Imports every record in a payload. Returns counts per outcome plus
// per-record results (first 20) for the caller.
async function importPayload(source, body) {
  const records = extractRecords(source, body).slice(0, MAX_RECORDS_PER_REQUEST);
  const defs = await listFieldDefinitions(source.partnerId);
  const defsByKey = Object.fromEntries(defs.filter((d) => d.isEnabled).map((d) => [d.fieldKey, d]));
  const ctx = { partnerId: source.partnerId, actorLabel: `${source.name} (Integration)` };

  const summary = { received: records.length, CREATED: 0, UPDATED: 0, UNCHANGED: 0, DUPLICATE: 0, REJECTED: 0, FAILED: 0 };
  const results = [];
  for (const record of records) {
    const result = await importRecord(source, record, ctx, defsByKey);
    summary[result.outcome] += 1;
    if (results.length < 20) results.push(result);
  }
  return { summary, results };
}

// Dry run for the mapping UI: what each record WOULD become, nothing saved.
async function previewPayload(source, body) {
  const records = extractRecords(source, body).slice(0, 5);
  const defs = await listFieldDefinitions(source.partnerId);
  const defsByKey = Object.fromEntries(defs.filter((d) => d.isEnabled).map((d) => [d.fieldKey, d]));
  return records.map((record) => ({ externalId: externalIdOf(source, record), mapped: mapRecord(source, record, defsByKey) }));
}

module.exports = { importPayload, previewPayload, extractRecords, mapRecord, MAX_RECORDS_PER_REQUEST };
