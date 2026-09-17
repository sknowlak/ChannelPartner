const { getTimeline } = require('../services/auditService');

// GET /api/channel-partner/registrations/:registrationId/audit
async function getAuditTimeline(req, res, next) {
  try {
    const { registrationId } = req.params;
    const events = await getTimeline(registrationId);
    return res.json({ registrationId, events });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAuditTimeline };
