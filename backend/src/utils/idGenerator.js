const Counter = require('../models/Counter');

const START_VALUES = {
  REG: 10000,
  BOOK: 90000,
  COMM: 90000,
  AUD: 0,
  OWN: 0,
  CUST: 0
};

async function nextId(prefix) {
  const start = START_VALUES[prefix] ?? 0;
  const counter = await Counter.findOneAndUpdate(
    { _id: prefix },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const seq = start + counter.seq;
  return `${prefix}-${seq}`;
}

module.exports = { nextId };
