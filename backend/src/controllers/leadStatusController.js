const leadStatusService = require('../services/leadStatusService');

// Settings -> Lead -> Statuses (section 49) - create/update/delete, all
// MANAGE_SETTINGS. Listing is GET /my/lead-statuses (myLeadsController),
// open to the whole team since the status-update form needs it.
async function create(req, res, next) {
  try {
    const { status, error } = await leadStatusService.createStatus(req.partnerId, req.body);
    if (error) return res.status(400).json({ reason: error });
    return res.status(201).json({ status });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { status, error, notFound } = await leadStatusService.updateStatus(req.partnerId, req.params.statusId, req.body);
    if (error) return res.status(notFound ? 404 : 400).json({ reason: error });
    return res.json({ status });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { error, notFound } = await leadStatusService.deleteStatus(req.partnerId, req.params.statusId);
    if (error) return res.status(notFound ? 404 : 400).json({ reason: error });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, update, remove };
