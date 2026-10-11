const LeadStatus = require('../models/LeadStatus');
const Registration = require('../models/Registration');
const NotificationRule = require('../models/NotificationRule');
const { DEFAULT_LEAD_STATUSES } = require('../config/leadStatuses');
const { nextId } = require('../utils/idGenerator');

// Seed-once (unlike lead fields' additive ensureBaseFields): statuses are
// fully custom (section 49), so a default the partner deleted must NOT
// come back - only a partner with no statuses at all gets the defaults.
async function ensureDefaultStatuses(partnerId) {
  if (await LeadStatus.exists({ partnerId })) return;
  const docs = [];
  for (const [i, s] of DEFAULT_LEAD_STATUSES.entries()) {
    const subStatuses = [];
    for (const sub of s.subStatuses) subStatuses.push({ ...sub, subStatusId: await nextId('SUB') });
    docs.push({
      statusId: await nextId('LST'),
      partnerId,
      name: s.name,
      color: s.color,
      sortOrder: i,
      isDefault: !!s.isDefault,
      isBooking: !!s.isBooking,
      subStatuses
    });
  }
  try {
    await LeadStatus.insertMany(docs, { ordered: false });
  } catch (err) {
    if (err.code !== 11000) throw err; // a concurrent request seeded first
  }
}

async function listStatuses(partnerId) {
  await ensureDefaultStatuses(partnerId);
  return LeadStatus.find({ partnerId }).sort({ sortOrder: 1, createdAt: 1 });
}

async function getDefaultStatusName(partnerId) {
  const statuses = await listStatuses(partnerId);
  return (statuses.find((s) => s.isDefault) || statuses.find((s) => s.isActive && !s.isBooking) || statuses[0])?.name || 'Registered';
}

async function getBookingStatusName(partnerId) {
  const statuses = await listStatuses(partnerId);
  return statuses.find((s) => s.isBooking)?.name || 'Booking';
}

// Resolves a name pair to the status + sub-status docs, plus the merged
// form config: the schedule prompt and fields from the status AND the
// chosen sub-status (a field is required if either level requires it).
async function resolveStatus(partnerId, statusName, subStatusName) {
  const statuses = await listStatuses(partnerId);
  const status = statuses.find((s) => s.name === statusName);
  if (!status) return { error: `Unknown status "${statusName}"` };
  let subStatus = null;
  if (subStatusName) {
    subStatus = status.subStatuses.find((s) => s.name === subStatusName);
    if (!subStatus) return { error: `"${subStatusName}" is not a sub-status of ${status.name}` };
  }
  const fieldMap = new Map();
  for (const f of [...status.fields, ...(subStatus?.fields || [])]) {
    fieldMap.set(f.fieldKey, { fieldKey: f.fieldKey, isRequired: !!(fieldMap.get(f.fieldKey)?.isRequired || f.isRequired) });
  }
  return {
    status,
    subStatus,
    requiresSchedule: !!(status.requiresSchedule || subStatus?.requiresSchedule),
    scheduleLabel: subStatus?.scheduleLabel || status.scheduleLabel || 'Scheduled at',
    fields: [...fieldMap.values()]
  };
}

function cleanFields(fields) {
  const seen = new Set();
  return (Array.isArray(fields) ? fields : [])
    .filter((f) => f && f.fieldKey && !seen.has(f.fieldKey) && seen.add(f.fieldKey))
    .map((f) => ({ fieldKey: String(f.fieldKey), isRequired: !!f.isRequired }));
}

async function cleanSubStatuses(input, existing = []) {
  const names = new Set();
  const out = [];
  for (const raw of Array.isArray(input) ? input : []) {
    const name = String(raw.name || '').trim();
    if (!name) continue;
    if (names.has(name.toLowerCase())) return { error: `Sub-status "${name}" is listed twice` };
    names.add(name.toLowerCase());
    const prior = raw.subStatusId && existing.find((s) => s.subStatusId === raw.subStatusId);
    out.push({
      subStatusId: prior ? prior.subStatusId : await nextId('SUB'),
      name,
      isActive: raw.isActive !== false,
      requiresSchedule: !!raw.requiresSchedule,
      scheduleLabel: String(raw.scheduleLabel || ''),
      fields: cleanFields(raw.fields)
    });
  }
  return { subStatuses: out };
}

// Exactly one default status and at most one booking status per partner -
// setting the flag on one status clears it on the others.
async function applyExclusiveFlags(partnerId, statusId, body) {
  if (body.isDefault) await LeadStatus.updateMany({ partnerId, statusId: { $ne: statusId } }, { isDefault: false });
  if (body.isBooking) await LeadStatus.updateMany({ partnerId, statusId: { $ne: statusId } }, { isBooking: false });
}

async function createStatus(partnerId, body) {
  const name = String(body.name || '').trim();
  if (!name) return { error: 'Status name is required' };
  const statuses = await listStatuses(partnerId);
  if (statuses.some((s) => s.name.toLowerCase() === name.toLowerCase())) return { error: `A status named "${name}" already exists` };
  const { subStatuses, error } = await cleanSubStatuses(body.subStatuses);
  if (error) return { error };

  const statusId = await nextId('LST');
  await applyExclusiveFlags(partnerId, statusId, body);
  const status = await LeadStatus.create({
    statusId,
    partnerId,
    name,
    color: body.color || '#2f6fed',
    sortOrder: body.sortOrder ?? statuses.length,
    isActive: body.isActive !== false,
    isDefault: !!body.isDefault,
    isBooking: !!body.isBooking,
    requiresSchedule: !!body.requiresSchedule,
    scheduleLabel: String(body.scheduleLabel || ''),
    fields: cleanFields(body.fields),
    subStatuses
  });
  return { status };
}

async function updateStatus(partnerId, statusId, body) {
  const status = await LeadStatus.findOne({ partnerId, statusId });
  if (!status) return { error: 'Status not found', notFound: true };

  if (body.isDefault === false && status.isDefault) return { error: 'Choose another status as the default for new leads first' };
  if (status.isDefault && body.isActive === false) return { error: 'The default status for new leads cannot be deactivated' };

  const oldName = status.name;
  const renames = [];
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return { error: 'Status name is required' };
    if (name !== oldName && await LeadStatus.exists({ partnerId, name, statusId: { $ne: statusId } })) {
      return { error: `A status named "${name}" already exists` };
    }
    status.name = name;
  }
  if (body.subStatuses !== undefined) {
    const { subStatuses, error } = await cleanSubStatuses(body.subStatuses, status.subStatuses);
    if (error) return { error };
    for (const next of subStatuses) {
      const prev = status.subStatuses.find((s) => s.subStatusId === next.subStatusId);
      if (prev && prev.name !== next.name) renames.push({ from: prev.name, to: next.name });
    }
    // Removing a sub-status that leads still sit in would leave them pointing
    // at a name that no longer exists - and every later progress update that
    // re-sends it would be rejected. Same rule as deleting a whole status.
    const keptIds = new Set(subStatuses.map((sub) => sub.subStatusId));
    for (const prev of status.subStatuses) {
      if (keptIds.has(prev.subStatusId)) continue;
      const inUse = await Registration.countDocuments({ partnerId, currentStage: oldName, subStatus: prev.name });
      if (inUse > 0) {
        return { error: `${inUse} lead${inUse === 1 ? ' is' : 's are'} in "${oldName} / ${prev.name}" - move ${inUse === 1 ? 'it' : 'them'} to another sub-status first` };
      }
    }
    status.subStatuses = subStatuses;
  }
  for (const key of ['color', 'sortOrder', 'scheduleLabel']) if (body[key] !== undefined) status[key] = body[key];
  for (const key of ['isActive', 'isDefault', 'isBooking', 'requiresSchedule']) if (body[key] !== undefined) status[key] = !!body[key];
  if (body.fields !== undefined) status.fields = cleanFields(body.fields);

  await applyExclusiveFlags(partnerId, statusId, body);
  await status.save();

  // Leads and notification-rule triggers store names, so a rename is
  // carried onto both - otherwise rules on the old name silently stop firing.
  if (status.name !== oldName) {
    await Registration.updateMany({ partnerId, currentStage: oldName }, { currentStage: status.name });
    await NotificationRule.updateMany({ partnerId, 'trigger.statusName': oldName }, { 'trigger.statusName': status.name });
  }
  for (const r of renames) {
    await Registration.updateMany({ partnerId, currentStage: status.name, subStatus: r.from }, { subStatus: r.to });
    await NotificationRule.updateMany(
      { partnerId, 'trigger.statusName': status.name, 'trigger.subStatusName': r.from },
      { 'trigger.subStatusName': r.to }
    );
  }
  return { status };
}

async function deleteStatus(partnerId, statusId) {
  const status = await LeadStatus.findOne({ partnerId, statusId });
  if (!status) return { error: 'Status not found', notFound: true };
  if (status.isDefault) return { error: 'The default status for new leads cannot be deleted - make another status the default first' };
  const inUse = await Registration.countDocuments({ partnerId, currentStage: status.name });
  if (inUse > 0) {
    return { error: `${inUse} lead${inUse === 1 ? ' is' : 's are'} in "${status.name}" - move ${inUse === 1 ? 'it' : 'them'} to another status, or deactivate this status instead` };
  }
  const rules = await NotificationRule.countDocuments({ partnerId, 'trigger.statusName': status.name });
  if (rules > 0) {
    return { error: `${rules} notification rule${rules === 1 ? ' is' : 's are'} triggered by "${status.name}" - change or delete ${rules === 1 ? 'it' : 'them'} first` };
  }
  await status.deleteOne();
  return { ok: true };
}

module.exports = {
  ensureDefaultStatuses,
  listStatuses,
  getDefaultStatusName,
  getBookingStatusName,
  resolveStatus,
  createStatus,
  updateStatus,
  deleteStatus
};
