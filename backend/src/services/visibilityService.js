const { getSettings } = require('./settingsService');

// Builds the builder-facing view of a registration: full detail is available
// to the partner, but the builder only sees fields permitted by the
// field-level sharing table (spec sections 9, 10, 12), and never before
// booking gets ownership/mutation rights.
async function buildBuilderView({ registration, customer, ownership, booking }) {
  const { fieldVisibility } = await getSettings();
  const isBooked = registration.isBooked;
  const visible = (field) => {
    const rule = fieldVisibility[field];
    if (!rule) return true;
    const level = isBooked ? rule.builderAfterBooking : rule.builderBeforeBooking;
    return level !== 'NONE';
  };

  return {
    registrationId: registration.registrationId,
    customer: visible('name') ? customer.name : undefined,
    mobile: visible('mobile') ? customer.mobile : undefined,
    email: visible('email') ? customer.email : undefined,
    project: visible('projectId') ? registration.projectId : undefined,
    partner: registration.partnerId,
    registrationStatus: registration.status,
    protectionUntil: registration.protectionExpiry,
    currentStage: visible('currentStage') ? registration.currentStage : undefined,
    ownership: ownership ? ownership.ownershipStatus : undefined,
    bookingStatus: booking ? booking.status : 'Pending',
    commissionStatus: 'LIMITED',
    restrictions: {
      canTakeOwnership: false,
      canAssignToAnotherPartner: false,
      canDeletePartnerRegistration: false,
      canChangePartnerAttribution: false,
      canOverrideDuplicateProtection: false
    }
  };
}

module.exports = { buildBuilderView };
