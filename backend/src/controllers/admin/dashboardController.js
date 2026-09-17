const Partner = require('../../models/Partner');
const Registration = require('../../models/Registration');
const Booking = require('../../models/Booking');
const CommissionEligibility = require('../../models/CommissionEligibility');

// GET /api/admin/dashboard
async function getDashboardSummary(req, res, next) {
  try {
    const [
      totalPartners,
      activePartners,
      totalRegistrations,
      acceptedRegistrations,
      rejectedRegistrations,
      pendingBookings,
      totalBookings,
      totalCommissionEligible
    ] = await Promise.all([
      Partner.countDocuments(),
      Partner.countDocuments({ status: 'ACTIVE' }),
      Registration.countDocuments(),
      Registration.countDocuments({ status: 'ACCEPTED' }),
      Registration.countDocuments({ status: 'REJECTED' }),
      Registration.countDocuments({ status: 'ACCEPTED', isBooked: false }),
      Booking.countDocuments(),
      CommissionEligibility.countDocuments({ eligibilityStatus: 'ELIGIBLE' })
    ]);

    return res.json({
      totalPartners,
      activePartners,
      totalRegistrations,
      acceptedRegistrations,
      rejectedRegistrations,
      pendingBookings,
      totalBookings,
      totalCommissionEligible
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboardSummary };
