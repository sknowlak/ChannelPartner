const crypto = require('crypto');

// Integration API keys (section 52) are stored only as a SHA-256 hash plus a
// short display prefix - the full key is shown once, when generated, and a
// database leak can't be replayed against the API. (A fast hash is fine
// here: the key is 192 random bits, not a guessable password.)
function generateApiKey() {
  return `lr_${crypto.randomBytes(24).toString('hex')}`;
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

function apiKeyFields(key) {
  return { apiKeyHash: hashApiKey(key), apiKeyPrefix: key.slice(0, 7), apiKeyCreatedAt: new Date() };
}

module.exports = { generateApiKey, hashApiKey, apiKeyFields };
