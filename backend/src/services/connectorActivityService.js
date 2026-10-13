const ConnectorActivity = require('../models/ConnectorActivity');
const { nextId } = require('../utils/idGenerator');

// Writes one line of a connector's activity log (section 59). Never throws:
// logging must not break a sync.
async function logActivity(partnerId, type, { connector = 'LINKEDIN', level = 'INFO', message = '', actor = '', registrationId = '', externalId = '', details = null } = {}) {
  try {
    await ConnectorActivity.create({
      activityId: await nextId('CACT'),
      partnerId,
      connector,
      type,
      level,
      message: String(message || '').slice(0, 1000),
      actor,
      registrationId,
      externalId: String(externalId || '').slice(0, 300),
      details
    });
  } catch (err) {
    console.error('[connectors] could not log activity', err.message);
  }
}

async function listActivity(partnerId, { connector = 'LINKEDIN', type, level, page = 1, pageSize = 25 } = {}) {
  const filter = { partnerId, connector };
  if (type) filter.type = type;
  if (level) filter.level = level;
  const size = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const current = Math.max(Number(page) || 1, 1);
  const [items, total] = await Promise.all([
    ConnectorActivity.find(filter).sort({ createdAt: -1 }).skip((current - 1) * size).limit(size).lean(),
    ConnectorActivity.countDocuments(filter)
  ]);
  return { items, total, page: current, pageSize: size };
}

module.exports = { logActivity, listActivity };
