const AuditEvent = require('../models/AuditEvent');
const { nextId } = require('../utils/idGenerator');
const { getContext } = require('../utils/requestContext');

// `platform` is almost never passed explicitly by callers - it's derived
// from the current request's X-Client-Platform header (via requestContext),
// UNLESS the actor is 'SYSTEM', in which case it's always just "System"
// regardless of which request happened to trigger the system-internal step.
async function logEvent({ registrationId, eventType, actor, source, platform, previousValue, newValue, description }) {
  const auditId = await nextId('AUD');
  const resolvedPlatform = platform || (actor === 'SYSTEM' ? 'System' : getContext().platform || 'External');
  return AuditEvent.create({
    auditId,
    registrationId,
    eventType,
    actor,
    source: source || 'LEADRAT',
    platform: resolvedPlatform,
    previousValue,
    newValue,
    description
  });
}

async function getTimeline(registrationId) {
  return AuditEvent.find({ registrationId }).sort({ timestamp: 1 });
}

module.exports = { logEvent, getTimeline };
