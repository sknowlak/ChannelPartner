// Default values for the configurable business rules referenced by the spec
// (sections 7 and 10). These seed the DB-backed Settings document the first
// time the app runs; from then on, the admin portal is the source of truth
// (see src/services/settingsService.js) and these defaults are only a
// fallback if no Settings document exists yet.

const DEFAULT_DUPLICATE_PROTECTION_DAYS = Number(process.env.DUPLICATE_PROTECTION_DAYS || 30);

// Identity fields used to detect a duplicate registration (spec section 7).
const DEFAULT_DUPLICATE_MATCH_FIELDS = ['mobile', 'email'];

// Field-level sharing table (spec section 10). Values: 'FULL' | 'LIMITED' | 'NONE'.
const DEFAULT_FIELD_VISIBILITY = {
  name: { builderBeforeBooking: 'FULL', builderAfterBooking: 'FULL' },
  mobile: { builderBeforeBooking: 'NONE', builderAfterBooking: 'FULL' },
  email: { builderBeforeBooking: 'NONE', builderAfterBooking: 'FULL' },
  projectId: { builderBeforeBooking: 'FULL', builderAfterBooking: 'FULL' },
  currentStage: { builderBeforeBooking: 'FULL', builderAfterBooking: 'FULL' },
  partnerNotes: { builderBeforeBooking: 'NONE', builderAfterBooking: 'NONE' },
  internalActivities: { builderBeforeBooking: 'NONE', builderAfterBooking: 'NONE' },
  bookingStatus: { builderBeforeBooking: 'LIMITED', builderAfterBooking: 'FULL' },
  commissionStatus: { builderBeforeBooking: 'LIMITED', builderAfterBooking: 'LIMITED' }
};

module.exports = {
  DEFAULT_DUPLICATE_PROTECTION_DAYS,
  DEFAULT_DUPLICATE_MATCH_FIELDS,
  DEFAULT_FIELD_VISIBILITY
};
