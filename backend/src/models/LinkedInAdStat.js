const mongoose = require('mongoose');

// Daily performance of one LinkedIn campaign (section 59), copied from
// LinkedIn's adAnalytics so spend and cost per lead can be reported beyond
// the 6 months LinkedIn keeps daily data. Re-fetched for recent days on
// every stats refresh (LinkedIn finalises figures over a few days).
const linkedInAdStatSchema = new mongoose.Schema(
  {
    partnerId: { type: String, required: true },
    accountUrn: { type: String, required: true },
    campaignUrn: { type: String, required: true },
    campaignName: { type: String, default: '' },
    date: { type: String, required: true }, // YYYY-MM-DD (UTC, as LinkedIn reports)
    currency: { type: String, default: '' },
    cost: { type: Number, default: 0 }, // in the ad account's currency
    costUsd: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    leads: { type: Number, default: 0 }, // oneClickLeads
    formOpens: { type: Number, default: 0 }
  },
  { timestamps: true }
);

linkedInAdStatSchema.index({ partnerId: 1, campaignUrn: 1, date: 1 }, { unique: true });
linkedInAdStatSchema.index({ partnerId: 1, date: 1 });

module.exports = mongoose.model('LinkedInAdStat', linkedInAdStatSchema);
