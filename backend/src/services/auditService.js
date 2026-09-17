const AuditEvent = require('../models/AuditEvent');
const { nextId } = require('../utils/idGenerator');

async function logEvent({ registrationId, eventType, actor, source, previousValue, newValue, description }) {
  const auditId = await nextId('AUD');
  return AuditEvent.create({
    auditId,
    registrationId,
    eventType,
    actor,
    source: source || 'LEADRAT',
    previousValue,
    newValue,
    description
  });
}

async function getTimeline(registrationId) {
  return AuditEvent.find({ registrationId }).sort({ timestamp: 1 });
}

module.exports = { logEvent, getTimeline };
