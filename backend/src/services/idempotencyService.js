const IdempotencyRecord = require('../models/IdempotencyRecord');

// How long a claimed-but-unfinished key blocks retries before it's treated
// as abandoned (the process died mid-operation).
const STALE_PENDING_MS = 2 * 60 * 1000;

function conflict(message) {
  const err = new Error(message);
  err.statusCode = 409;
  return err;
}

// Wraps an operation so a repeated external event/reference ID (spec section
// 16) replays the stored result instead of re-running the side effects.
// Returns { replayed, result }.
//
// The key is CLAIMED before the operation runs (a PENDING record, protected
// by the unique index), not stored afterwards - otherwise two copies of the
// same event arriving together both pass the "seen it?" check and both
// create a booking + commission. Keys are scoped per partner (`scope`), so
// one partner can't pre-submit another partner's predictable reference ID
// and make the real request silently replay someone else's response.
async function withIdempotency(key, routeName, operation, scope = '') {
  if (!key) {
    const result = await operation();
    return { replayed: false, result };
  }

  const scopedRoute = scope ? `${routeName}:${scope}` : routeName;
  const scopedKey = String(key);

  try {
    await IdempotencyRecord.create({ key: scopedKey, routeName: scopedRoute, state: 'PENDING' });
  } catch (err) {
    if (err.code !== 11000) throw err;
    const existing = await IdempotencyRecord.findOne({ key: scopedKey, routeName: scopedRoute });
    if (existing?.state !== 'PENDING') return { replayed: true, result: existing.response };

    // Another request with this key is mid-flight - unless it was abandoned.
    if (Date.now() - existing.updatedAt.getTime() < STALE_PENDING_MS) {
      throw conflict('A request with this reference ID is already being processed - retry shortly');
    }
    const takenOver = await IdempotencyRecord.findOneAndUpdate(
      { _id: existing._id, state: 'PENDING', updatedAt: existing.updatedAt },
      { $set: { state: 'PENDING' } },
      { new: true, timestamps: true }
    );
    if (!takenOver) throw conflict('A request with this reference ID is already being processed - retry shortly');
  }

  let result;
  try {
    result = await operation();
  } catch (err) {
    // Release the key so the caller can retry once the problem is fixed.
    await IdempotencyRecord.deleteOne({ key: scopedKey, routeName: scopedRoute, state: 'PENDING' }).catch(() => {});
    throw err;
  }

  await IdempotencyRecord.updateOne({ key: scopedKey, routeName: scopedRoute }, { $set: { state: 'DONE', response: result } });
  return { replayed: false, result };
}

module.exports = { withIdempotency };
