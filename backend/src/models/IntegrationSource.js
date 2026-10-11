const mongoose = require('mongoose');

// Where leads come IN from another system, in that system's own format
// (section 51). Two kinds share one mapping engine (leadImportService):
//
// - RECEIVE: the other system calls us. Each source gets its own URL
//   (/api/channel-partner/hooks/<sourceKey>) - the secret key is in the URL,
//   so any sender works even if it can't set headers. Optional HMAC check.
// - PULL: we call the other system's API on a schedule (GET/POST, any auth,
//   paging), and import whatever records it returns.
//
// `mapping` says which of THEIR fields fills which of OUR lead fields;
// `externalIdPath` is their record ID, used to update instead of duplicate.
const mappingRowSchema = new mongoose.Schema(
  {
    fieldKey: { type: String, required: true }, // a LeadFieldDefinition.fieldKey, or 'stage' / 'subStatus'
    source: { type: String, enum: ['PATH', 'FIXED'], default: 'PATH' },
    path: { type: String, default: '' },
    value: { type: mongoose.Schema.Types.Mixed, default: '' }
  },
  { _id: false }
);

const integrationSourceSchema = new mongoose.Schema(
  {
    sourceId: { type: String, required: true, unique: true },
    partnerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    kind: { type: String, enum: ['RECEIVE', 'PULL'], required: true },
    isEnabled: { type: Boolean, default: true },

    // --- mapping (both kinds) ---
    recordsPath: { type: String, default: '' }, // where the list of records is, e.g. `data` or `entry.0.changes`; blank = the body itself
    externalIdPath: { type: String, default: '' },
    mapping: { type: [mappingRowSchema], default: [] },
    statusMap: { type: [{ _id: false, from: String, to: String }], default: [] }, // their status value -> our status name
    defaultCountry: { type: String, default: 'IN' }, // for phone numbers sent without a country code
    updateExisting: { type: Boolean, default: true },

    // --- RECEIVE ---
    sourceKey: { type: String, unique: true, sparse: true },
    verifyAuth: { type: mongoose.Schema.Types.Mixed, default: { type: 'NONE' } }, // HMAC check on what they send
    verifyToken: { type: String, default: '' }, // echo-challenge handshake (e.g. Facebook ?hub.verify_token)
    sampleBody: { type: mongoose.Schema.Types.Mixed, default: null }, // last received payload, to build the mapping from

    // --- PULL ---
    url: { type: String, default: '' }, // may use {{since}}, {{page}}, {{offset}}, {{cursor}}, {{limit}}
    method: { type: String, enum: ['GET', 'POST'], default: 'GET' },
    headers: { type: mongoose.Schema.Types.Mixed, default: {} },
    bodyTemplate: { type: String, default: '' },
    auth: { type: mongoose.Schema.Types.Mixed, default: { type: 'NONE' } },
    pagination: {
      type: { type: String, enum: ['NONE', 'PAGE', 'OFFSET', 'CURSOR', 'NEXT_URL'], default: 'NONE' },
      pageSize: { type: Number, default: 50 },
      startPage: { type: Number, default: 1 },
      cursorPath: { type: String, default: '' }, // where the next cursor is in each response
      nextUrlPath: { type: String, default: '' }, // where the next page's full URL is
      maxPages: { type: Number, default: 10 }
    },
    intervalMinutes: { type: Number, default: 15, min: 5, max: 1440 },
    nextRunAt: { type: Date, default: null },
    lastRunAt: { type: Date, default: null },
    lastSince: { type: Date, default: null }, // {{since}} for the next run = when the last successful run started
    lastResult: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

integrationSourceSchema.index({ kind: 1, isEnabled: 1, nextRunAt: 1 });

module.exports = mongoose.model('IntegrationSource', integrationSourceSchema);
