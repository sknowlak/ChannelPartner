const crypto = require('crypto');

function generateApiKey() {
  return `lr_${crypto.randomBytes(24).toString('hex')}`;
}

module.exports = { generateApiKey };
