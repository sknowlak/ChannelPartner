require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Partner = require('../src/models/Partner');
const Admin = require('../src/models/Admin');
const { nextId } = require('../src/utils/idGenerator');
const { hashPassword } = require('../src/services/adminAuthService');
const { getSettings } = require('../src/services/settingsService');
const { ensureBaseFields } = require('../src/services/fieldDefinitionService');

// Seeds the partner used in the mandatory hackathon demo scenario
// (spec section 19): ABC Realty registering Rahul Kumar for Project A.
// Also seeds a default admin login, the global settings document, the
// standard partner field definitions, and the demo partners themselves.
async function seedPartner(partnerId, name, username, contactEmail) {
  const existing = await Partner.findOne({ partnerId });
  if (existing) {
    console.log(`Partner ${partnerId} already exists, skipped`);
    return;
  }

  const partnerCode = await nextId('PCODE');
  await Partner.create({
    partnerId,
    partnerCode,
    name,
    mobile: '+91XXXXXXXXXX',
    email: contactEmail,
    username,
    passwordHash: await hashPassword('Partner@12345'),
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    approvalStatus: 'APPROVED',
    createdBy: 'SYSTEM_SEED'
  });
}

async function seed() {
  await connectDB();

  await seedPartner('PARTNER-001', 'ABC Realty', 'abcrealty', 'contact@abcrealty.example');
  await seedPartner('PARTNER-002', 'XYZ Properties', 'xyzproperties', 'contact@xyzproperties.example');

  const adminEmail = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@leadrat.example').toLowerCase();
  const existingAdmin = await Admin.findOne({ email: adminEmail });
  if (!existingAdmin) {
    const adminId = await nextId('ADMIN');
    const passwordHash = await hashPassword(process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@12345');
    await Admin.create({
      adminId,
      name: 'Default Admin',
      email: adminEmail,
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE'
    });
    console.log(`Seed complete: admin login ${adminEmail} / ${process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@12345'}`);
  } else {
    console.log(`Admin ${adminEmail} already exists, skipped`);
  }

  await getSettings(); // ensures the GLOBAL_SETTINGS document exists
  await ensureBaseFields(); // ensures the standard partner field definitions exist

  console.log('Seed complete: PARTNER-001 (ABC Realty), PARTNER-002 (XYZ Properties), global settings + field definitions initialised');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
