const { ALL_PERMISSIONS } = require('../config/permissions');

// Runs an Express handler (e.g. myLeadsController.createMyRegistration)
// in-process with a synthetic req/res and resolves with { status, data }.
//
// Imported records (receive/pull sources, section 51) go through the very
// same handlers a person or the inbound API uses - same validation,
// duplicate protection, protection claims, audit history, webhooks and
// notifications - instead of a second copy of that logic that could drift.
function invokeHandler(handler, { partnerId, actorLabel, params = {}, body = {}, query = {}, extra = {} }) {
  return new Promise((resolve, reject) => {
    const req = {
      partnerId,
      actorLabel,
      params,
      body,
      query,
      headers: {},
      role: 'OWNER',
      memberId: null,
      permissions: ALL_PERMISSIONS,
      ...extra
    };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        resolve({ status: this.statusCode, data });
        return this;
      },
      set() {
        return this;
      }
    };
    Promise.resolve(handler(req, res, (err) => (err ? reject(err) : resolve({ status: 404, data: null })))).catch(reject);
  });
}

module.exports = { invokeHandler };
