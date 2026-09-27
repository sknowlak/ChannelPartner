require('dotenv').config();
const mongoose = require('mongoose');
const { parsePhoneNumberFromString } = require('libphonenumber-js/max');
const connectDB = require('../src/config/db');
const Customer = require('../src/models/Customer');
const Partner = require('../src/models/Partner');
const TeamMember = require('../src/models/TeamMember');
const { validatePhoneNumber } = require('../src/utils/phone');

// One-time backfill for two things:
//  (a) data saved before a country code became mandatory (see
//      validatePhoneNumber in src/utils/phone.js) - every such number has
//      no "+", so it's resolved against 'IN' as the default country, since
//      that's this business's evident pre-existing context, not a guess
//      pulled from nowhere;
//  (b) Customer's new structured fields (mobileCountryCode/mobileDialCode/
//      mobileNationalNumber - see src/models/Customer.js), which the
//      pre('validate') hook only computes when `mobile` is actually
//      modified, so already-E.164 rows need an explicit pass here too.
const DEFAULT_COUNTRY = 'IN';

function resolveCountryCode(raw) {
  const value = String(raw).trim();
  if (!value || value.startsWith('+')) return { value, changed: false };
  const parsed = parsePhoneNumberFromString(value, DEFAULT_COUNTRY);
  if (parsed && parsed.isValid()) return { value: parsed.number, changed: true };
  return { value, changed: false, unresolved: true };
}

async function migratePartnerLike(Model, fieldNames) {
  const docs = await Model.find({});
  let changed = 0;
  let unresolved = 0;
  for (const doc of docs) {
    let touched = false;
    for (const field of fieldNames) {
      const raw = doc[field];
      if (!raw) continue;
      const resolved = resolveCountryCode(raw);
      if (resolved.unresolved) {
        console.warn(`  [UNRESOLVED] ${Model.modelName} ${doc._id} ${field}="${raw}" - not a valid ${DEFAULT_COUNTRY} number, left as-is`);
        unresolved++;
        continue;
      }
      if (resolved.changed) {
        doc[field] = resolved.value;
        touched = true;
      }
    }
    if (touched) {
      await doc.save();
      changed++;
    }
  }
  console.log(`${Model.modelName}: ${changed}/${docs.length} updated (${unresolved} unresolved)`);
}

async function migrateCustomers() {
  const docs = await Customer.find({});
  let changed = 0;
  let unresolved = 0;
  for (const doc of docs) {
    let touched = false;

    // (a) add a missing country code first, same as the other collections
    for (const field of ['mobile', 'alternateMobile']) {
      const raw = doc[field];
      if (!raw) continue;
      const resolved = resolveCountryCode(raw);
      if (resolved.unresolved) {
        console.warn(`  [UNRESOLVED] Customer ${doc._id} ${field}="${raw}" - not a valid ${DEFAULT_COUNTRY} number, left as-is`);
        unresolved++;
        continue;
      }
      if (resolved.changed) {
        doc[field] = resolved.value;
        touched = true;
      }
    }

    // (b) (re)populate the structured breakdown of `mobile` unconditionally -
    // covers rows whose mobile already had a country code before this
    // migration ever ran, which step (a) alone would skip since it never
    // touches (and so never triggers the model's pre-validate hook for) them.
    const parsed = validatePhoneNumber(doc.mobile, undefined);
    if (parsed.valid) {
      if (doc.mobileCountryCode !== parsed.country || doc.mobileDialCode !== parsed.dialCode || doc.mobileNationalNumber !== parsed.nationalNumber) {
        doc.mobileCountryCode = parsed.country;
        doc.mobileDialCode = parsed.dialCode;
        doc.mobileNationalNumber = parsed.nationalNumber;
        touched = true;
      }
    }

    if (touched) {
      await doc.save();
      changed++;
    }
  }
  console.log(`Customer: ${changed}/${docs.length} updated (${unresolved} unresolved)`);
}

async function main() {
  await connectDB();
  await migrateCustomers();
  await migratePartnerLike(Partner, ['mobile']);
  await migratePartnerLike(TeamMember, ['mobile']);

  // Builds the new unique index on Customer.mobileNormalized (see the
  // schema) if it isn't there yet. Reports rather than crashing if
  // duplicate mobileNormalized values already exist - those need manual
  // resolution (merge the Customer records) before the index can be added;
  // the migration itself must never silently drop or merge data on its own.
  try {
    await Customer.syncIndexes();
    console.log('Customer indexes synced (including unique mobileNormalized).');
  } catch (err) {
    console.error('Could not sync Customer indexes - likely duplicate mobileNormalized values need manual review:', err.message);
  }

  console.log('Migration complete.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
