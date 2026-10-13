const mongoose = require('mongoose');
const Partner = require('../models/Partner');
const TeamMember = require('../models/TeamMember');

// Section 60: the timezone default changed from 'UTC' to '' (Automatic -
// each person sees their device's local time). Accounts still on 'UTC' got
// it as the old default, so they move to Automatic. Runs ONCE (marker in
// the `migrations` collection): anyone choosing UTC afterwards keeps it.
const MARKER = 'timezone-automatic-2026-10';

async function runTimezoneMigration() {
  const migrations = mongoose.connection.db.collection('migrations');
  const claimed = await migrations.updateOne({ _id: MARKER }, { $setOnInsert: { ranAt: new Date() } }, { upsert: true });
  if (!claimed.upsertedCount) return null; // already done
  const [partners, members] = await Promise.all([
    Partner.updateMany({ timezone: 'UTC' }, { $set: { timezone: '' } }),
    TeamMember.updateMany({ timezone: 'UTC' }, { $set: { timezone: '' } })
  ]);
  console.log(`[migration] timezone: ${partners.modifiedCount} partner(s), ${members.modifiedCount} team member(s) moved from UTC to Automatic`);
  return { partners: partners.modifiedCount, members: members.modifiedCount };
}

module.exports = { runTimezoneMigration };
