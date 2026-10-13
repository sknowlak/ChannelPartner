const mongoose = require('mongoose');

// A channel partner's LinkedIn connection (section 59): the OAuth tokens of
// the LinkedIn member who connected (encrypted - utils/secretBox.js, never
// returned by the API), the ad accounts that member can see and which of
// them sync, and the partner's settings. One connection per partner.

const adAccountSchema = new mongoose.Schema(
  {
    accountUrn: { type: String, required: true }, // urn:li:sponsoredAccount:123
    name: { type: String, default: '' },
    currency: { type: String, default: '' },
    role: { type: String, default: '' },
    status: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    webhookSubscriptionId: { type: String, default: '' }
  },
  { _id: false }
);

// Conversions API (CAPI): a lead reaching `stage` is reported to LinkedIn as
// `conversionUrn` on the ad account it came from.
const capiRuleSchema = new mongoose.Schema(
  {
    stage: { type: String, required: true },
    accountUrn: { type: String, required: true },
    conversionUrn: { type: String, required: true },
    conversionType: { type: String, default: 'QUALIFIED_LEAD' },
    name: { type: String, default: '' }
  },
  { _id: false }
);

const linkedInConnectionSchema = new mongoose.Schema(
  {
    connectionId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['CONNECTED', 'EXPIRED', 'ERROR', 'DISCONNECTED'], default: 'CONNECTED' },
    memberName: { type: String, default: '' },
    memberUrn: { type: String, default: '' },
    connectedBy: { type: String, default: '' },
    connectedAt: { type: Date, default: Date.now },
    scopes: { type: [String], default: [] },

    accessToken: { type: String, default: '' }, // sealed
    accessTokenExpiresAt: { type: Date, default: null },
    refreshToken: { type: String, default: '' }, // sealed
    refreshTokenExpiresAt: { type: Date, default: null },

    adAccounts: { type: [adAccountSchema], default: [] },

    settings: {
      defaultCountry: { type: String, default: 'IN' },
      syncMinutes: { type: Number, default: 10, min: 5, max: 60 },
      includeTestLeads: { type: Boolean, default: false },
      capiEnabled: { type: Boolean, default: false },
      capiRules: { type: [capiRuleSchema], default: [] }
    },

    // Lead sync window: leads submitted after this time are fetched next run.
    leadsSyncedUntil: { type: Date, default: null },
    // Last daily catch-up (re-checks the last 7 days for anything missed).
    catchUpAt: { type: Date, default: null },
    statsSyncedAt: { type: Date, default: null },
    lastSyncAt: { type: Date, default: null },
    nextSyncAt: { type: Date, default: () => new Date(), index: true },
    lastError: { type: String, default: '' },
    lastErrorAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('LinkedInConnection', linkedInConnectionSchema);
