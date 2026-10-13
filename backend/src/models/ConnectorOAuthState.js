const mongoose = require('mongoose');

// One "Connect LinkedIn" attempt (section 59): the random `state` sent to
// LinkedIn and checked on the way back, so a callback can only complete a
// connection the partner started (CSRF protection). Expires in 15 minutes.
const connectorOAuthStateSchema = new mongoose.Schema({
  state: { type: String, required: true, unique: true },
  connector: { type: String, required: true },
  partnerId: { type: String, required: true },
  actorLabel: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, expires: 15 * 60 }
});

module.exports = mongoose.model('ConnectorOAuthState', connectorOAuthStateSchema);
