require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Partner = require('../src/models/Partner');
const Admin = require('../src/models/Admin');
const Builder = require('../src/models/Builder');
const BuilderUser = require('../src/models/BuilderUser');
const Project = require('../src/models/Project');
const { nextId } = require('../src/utils/idGenerator');
const { hashPassword } = require('../src/services/adminAuthService');
const { getSettings } = require('../src/services/settingsService');
const { ensureBaseFields } = require('../src/services/fieldDefinitionService');
const { ensureDefaultRoles } = require('../src/services/roleService');
const { ensureBaseFields: ensureBaseLeadFields } = require('../src/services/leadFieldDefinitionService');
const { ensureBaseFields: ensureBaseUserFields } = require('../src/services/userFieldDefinitionService');

// Seeds the global settings, the standard partner field definitions and the
// first admin login. Outside production it also seeds synthetic demo data
// for the hackathon scenario (spec sections 19 and 52): two partners, a
// builder with a portal login, and its projects.
//
// Production (NODE_ENV=production): no demo partners/builders, and the admin
// password must come from DEFAULT_ADMIN_PASSWORD - the well-known default is
// refused. If it's unset, a random one is generated and printed once.
const isProduction = process.env.NODE_ENV === 'production';
const KNOWN_DEFAULT = 'Admin@12345';
const DEMO_PASSWORD = 'Partner@12345';

function adminPassword() {
  const configured = process.env.DEFAULT_ADMIN_PASSWORD;
  if (!isProduction) return configured || KNOWN_DEFAULT;
  if (configured && configured !== KNOWN_DEFAULT && configured.length >= 12) return configured;
  if (configured) throw new Error('DEFAULT_ADMIN_PASSWORD must be at least 12 characters and not the documented default in production');
  return crypto.randomBytes(12).toString('base64url');
}

async function seedPartner(partnerId, name, username, contactEmail) {
  if (await Partner.findOne({ partnerId })) {
    console.log(`Partner ${partnerId} already exists, skipped`);
    return;
  }
  const superAdminRole = await ensureDefaultRoles(partnerId);
  await ensureBaseLeadFields(partnerId);
  await ensureBaseUserFields(partnerId);
  await Partner.create({
    partnerId,
    partnerCode: await nextId('PCODE'),
    name,
    mobile: '+91XXXXXXXXXX',
    email: contactEmail,
    username,
    passwordHash: await hashPassword(DEMO_PASSWORD),
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    approvalStatus: 'APPROVED',
    createdBy: 'SYSTEM_SEED',
    roleId: superAdminRole.roleId
  });
}

async function seedDemoBuilder() {
  let builder = await Builder.findOne({ name: 'Prestige Builders (Demo)' });
  if (!builder) builder = await Builder.create({ builderId: await nextId('BLD'), name: 'Prestige Builders (Demo)', createdBy: 'SYSTEM_SEED' });
  if (!(await BuilderUser.exists({ email: 'builder@prestige.example' }))) {
    await BuilderUser.create({
      builderUserId: await nextId('BUSR'),
      builderId: builder.builderId,
      name: 'Demo Builder User',
      email: 'builder@prestige.example',
      passwordHash: await hashPassword(DEMO_PASSWORD)
    });
  }
  for (const [projectId, name, city] of [['PROJECT-A', 'Prestige Lakeside', 'Bengaluru'], ['PROJECT-B', 'Prestige Park Grove', 'Bengaluru']]) {
    if (!(await Project.exists({ projectId }))) await Project.create({ projectId, name, builderId: builder.builderId, city });
  }
}

async function seed() {
  await connectDB();

  if (!isProduction) {
    await seedPartner('PARTNER-001', 'ABC Realty', 'abcrealty', 'contact@abcrealty.example');
    await seedPartner('PARTNER-002', 'XYZ Properties', 'xyzproperties', 'contact@xyzproperties.example');
    await seedDemoBuilder();
    console.log(`Demo data (development only): partners abcrealty / xyzproperties, builder builder@prestige.example - password ${DEMO_PASSWORD}`);
  }

  const adminEmail = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@leadrat.example').toLowerCase();
  if (!(await Admin.findOne({ email: adminEmail }))) {
    const password = adminPassword();
    await Admin.create({
      adminId: await nextId('ADMIN'),
      name: 'Default Admin',
      email: adminEmail,
      passwordHash: await hashPassword(password),
      role: 'SUPER_ADMIN',
      status: 'ACTIVE'
    });
    // Printed once so it can be stored safely; change it after first login.
    console.log(`Admin created: ${adminEmail} / ${password}`);
  } else {
    console.log(`Admin ${adminEmail} already exists, skipped`);
  }

  await getSettings(); // ensures the GLOBAL_SETTINGS document exists
  await ensureBaseFields(); // ensures the standard partner field definitions exist
  console.log('Seed complete');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
