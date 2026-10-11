const AuditEvent = require('../../models/AuditEvent');

// GET /api/admin/audit?registrationId=&eventType=&actor=&from=&to=&page=&limit=
// Global audit feed across every partner and registration - not scoped to a
// single registration like the channel-partner-facing audit endpoint.
async function listAudit(req, res, next) {
  try {
    const { registrationId, eventType, actor, from, to } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 50);

    const filter = {};
    if (registrationId) filter.registrationId = String(registrationId);
    if (eventType) filter.eventType = String(eventType);
    if (actor) filter.actor = String(actor);
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }

    const [events, total] = await Promise.all([
      AuditEvent.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AuditEvent.countDocuments(filter)
    ]);

    return res.json({ page, limit, total, events });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAudit };
