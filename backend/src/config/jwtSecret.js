// Single source of the JWT signing secret for both admin and partner
// tokens. There is deliberately no fallback value: a missing or guessable
// secret lets anyone forge an ADMIN or PARTNER token, so the server refuses
// to start instead of silently running with one (spec section 50).
const KNOWN_DEFAULTS = ['change-this-in-production', 'secret', 'changeme'];
const MIN_LENGTH = 32;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'test' && !secret) return 'test-only-secret-not-used-outside-jest-runs';

  if (!secret || KNOWN_DEFAULTS.includes(secret) || secret.length < MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set in backend/.env to a random value of at least ${MIN_LENGTH} characters ` +
      '(e.g. node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))")'
    );
  }
  return secret;
}

module.exports = { getJwtSecret };
