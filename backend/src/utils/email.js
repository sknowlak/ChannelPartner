// Email handling shared by account forms and customer duplicate detection.
//
// normalizeEmail is the matching key - what Customer.emailNormalized stores
// and what findDuplicate queries by. Without it, `Victim@Gmail.com `
// (capital + trailing space) or `victim+1@gmail.com` slipped past the exact
// `{ email }` match and the same customer could be registered twice.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'];

function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_PATTERN.test(value.trim());
}

// trim + lowercase, drop any "+tag" from the local part, and for Gmail also
// drop dots (Gmail ignores them, so a.b@gmail.com is ab@gmail.com).
function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return trimmed;

  let local = trimmed.slice(0, at).split('+')[0];
  let domain = trimmed.slice(at + 1);
  if (GMAIL_DOMAINS.includes(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

module.exports = { isValidEmail, normalizeEmail };
