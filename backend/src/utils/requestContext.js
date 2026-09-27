const { AsyncLocalStorage } = require('async_hooks');

// Carries a couple of request-scoped values (right now just `platform`)
// through the async call chain without threading them through every
// function signature - section 41's lead History needs "which platform did
// this" on every audit event, and touching all ~30 existing logEvent() call
// sites to pass it explicitly would be pure churn for no behavioral gain.
const storage = new AsyncLocalStorage();

function runWithContext(context, fn) {
  return storage.run(context, fn);
}

function getContext() {
  return storage.getStore() || {};
}

module.exports = { runWithContext, getContext };
