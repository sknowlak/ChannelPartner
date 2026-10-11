const mongoose = require('mongoose');

// "This lead is record X in that system" (section 51) - the piece that makes
// integrations two-way instead of fire-and-forget:
// - push webhooks store the ID the target returned on create, so later
//   updates go to the same record (and {{external.id}} can fill the URL);
// - receive/pull sources store the sender's own ID, so a second message
//   about the same record updates the lead instead of creating a duplicate.
// `connectorId` is the webhookId or sourceId the link belongs to.
const integrationLinkSchema = new mongoose.Schema(
  {
    partnerId: { type: String, required: true, index: true },
    connectorId: { type: String, required: true },
    registrationId: { type: String, required: true },
    externalId: { type: String, required: true }
  },
  { timestamps: true }
);

integrationLinkSchema.index({ connectorId: 1, registrationId: 1 }, { unique: true });
integrationLinkSchema.index({ connectorId: 1, externalId: 1 }, { unique: true });

module.exports = mongoose.model('IntegrationLink', integrationLinkSchema);
