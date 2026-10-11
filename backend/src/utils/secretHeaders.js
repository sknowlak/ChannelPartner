// Webhook headers usually carry a client CRM's credentials
// (Authorization: Bearer ..., X-Api-Key: ...). These helpers keep those
// values out of places the whole team can read: list responses for members
// without MANAGE_SETTINGS, and the stored delivery log.

const SENSITIVE_NAME = /auth|key|token|secret|pass|cookie|signature|session|credential/i;
const REDACTED = '[redacted]';

function isSensitiveHeader(name) {
  return SENSITIVE_NAME.test(String(name));
}

// For display: keep the last 4 characters so people can tell keys apart.
function maskValue(value) {
  const str = String(value ?? '');
  return str.length > 8 ? `••••${str.slice(-4)}` : '••••';
}

function maskHeaders(headers) {
  const out = {};
  for (const [name, value] of Object.entries(headers || {})) {
    out[name] = isSensitiveHeader(name) ? maskValue(value) : value;
  }
  return out;
}

// For storage in WebhookDelivery: the secret is replaced entirely.
// retryDelivery fills redacted values back in from the live webhook config.
function redactHeaders(headers) {
  const out = {};
  for (const [name, value] of Object.entries(headers || {})) {
    out[name] = isSensitiveHeader(name) ? REDACTED : value;
  }
  return out;
}

function restoreRedacted(storedHeaders, liveHeaders) {
  const out = { ...(storedHeaders || {}) };
  for (const [name, value] of Object.entries(out)) {
    if (value === REDACTED && liveHeaders && liveHeaders[name] !== undefined) out[name] = liveHeaders[name];
  }
  return out;
}

// Shape check for user-supplied header maps: valid names, single-line
// string values (no CR/LF header injection), and a sane count.
const MAX_HEADERS = 30;

function headersProblem(headers) {
  if (headers === undefined) return null;
  if (headers === null || typeof headers !== 'object' || Array.isArray(headers)) return 'headers must be an object of name: value pairs';
  const entries = Object.entries(headers);
  if (entries.length > MAX_HEADERS) return `At most ${MAX_HEADERS} headers are allowed`;
  for (const [name, value] of entries) {
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) return `"${name}" is not a valid header name`;
    if (typeof value !== 'string' || /[\r\n]/.test(value)) return `Header "${name}" must be a single-line text value`;
  }
  return null;
}

module.exports = { isSensitiveHeader, maskHeaders, redactHeaders, restoreRedacted, headersProblem, REDACTED };
