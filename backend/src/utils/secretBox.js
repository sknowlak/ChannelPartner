const crypto = require('crypto');
const { getJwtSecret } = require('../config/jwtSecret');

// Encrypts secrets kept in the database (AES-256-GCM) - used for connector
// OAuth tokens (section 59), which give access to a partner's ad account
// and leads. Key: CONNECTOR_ENCRYPTION_KEY (64 hex chars = 32 bytes).
// Outside production a missing key falls back to one derived from
// JWT_SECRET so development works; with NODE_ENV=production a missing or
// malformed key is refused (server.js checks at startup, and key() throws
// on first use) - silently deriving it would tie every stored token to
// JWT_SECRET, so rotating that secret would make them all unreadable.

const PREFIX = 'enc:v1:';
let cachedKey = null;

function assertKeyConfigured(env = process.env) {
  const raw = env.CONNECTOR_ENCRYPTION_KEY || '';
  if (env.NODE_ENV === 'production' && !/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error(
      'CONNECTOR_ENCRYPTION_KEY must be set in production to 64 hex characters (32 bytes) - '
      + `e.g. node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
}

function key() {
  if (cachedKey) return cachedKey;
  assertKeyConfigured();
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY || '';
  if (/^[0-9a-f]{64}$/i.test(raw)) cachedKey = Buffer.from(raw, 'hex');
  else cachedKey = crypto.createHash('sha256').update(`leadrat-connector-secrets:${getJwtSecret()}`).digest();
  return cachedKey;
}

function seal(plain) {
  if (plain === undefined || plain === null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

// Returns '' for empty input; throws if the value was tampered with or
// sealed with a different key.
function open(sealed) {
  if (!sealed) return '';
  if (!String(sealed).startsWith(PREFIX)) throw new Error('Not an encrypted value');
  const buf = Buffer.from(String(sealed).slice(PREFIX.length), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

module.exports = { seal, open, assertKeyConfigured };
