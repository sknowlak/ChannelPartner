const IdempotencyRecord = require('../models/IdempotencyRecord');

// Wraps an operation so a repeated external event/reference ID (spec section
// 16) replays the stored result instead of re-running the side effects.
// Returns { replayed, result }.
async function withIdempotency(key, routeName, operation) {
  if (!key) {
    const result = await operation();
    return { replayed: false, result };
  }

  const existing = await IdempotencyRecord.findOne({ key, routeName });
  if (existing) {
    return { replayed: true, result: existing.response };
  }

  const result = await operation();

  try {
    await IdempotencyRecord.create({ key, routeName, response: result });
  } catch (err) {
    if (err.code !== 11000) throw err; // race: another request stored it first, safe to ignore
  }

  return { replayed: false, result };
}

module.exports = { withIdempotency };
