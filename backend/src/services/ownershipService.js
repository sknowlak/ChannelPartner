const Ownership = require('../models/Ownership');
const { nextId } = require('../utils/idGenerator');

async function createInitialOwnership(registrationId, partnerId) {
  const ownershipId = await nextId('OWN');
  return Ownership.create({
    ownershipId,
    registrationId,
    workingOwner: partnerId,
    operationalOwner: partnerId,
    ownershipStatus: 'PARTNER_OWNED'
  });
}

async function transferOperationalOwnershipToBuilder(registrationId) {
  const ownership = await Ownership.findOne({ registrationId });
  if (!ownership) throw new Error(`Ownership record not found for registration ${registrationId}`);

  ownership.operationalOwner = 'BUILDER';
  ownership.ownershipStatus = 'BUILDER_OWNED';
  await ownership.save();
  return ownership;
}

async function getOwnership(registrationId) {
  return Ownership.findOne({ registrationId }).sort({ createdAt: -1 });
}

module.exports = { createInitialOwnership, transferOperationalOwnershipToBuilder, getOwnership };
