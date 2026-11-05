const Partner = require('../../models/Partner');
const Registration = require('../../models/Registration');
const Booking = require('../../models/Booking');
const CommissionEligibility = require('../../models/CommissionEligibility');
const Dispute = require('../../models/Dispute');

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
      Booking.countDocuments({ status: { $ne: 'CANCELLED' } }),
      CommissionEligibility.countDocuments({ eligibilityStatus: 'ELIGIBLE' })
    ]);

    // Section 62: disputes, cancellations, a 30-day trend and a partner
    // leaderboard (most bookings, then most leads).
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [openDisputes, cancelledBookings, trend, leaders] = await Promise.all([
      Dispute.countDocuments({ status: 'OPEN' }),
      Booking.countDocuments({ status: 'CANCELLED' }),
      Registration.aggregate([
        { $match: { registeredAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$registeredAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Registration.aggregate([
        {
          $group: {
            _id: '$partnerId',
            leads: { $sum: 1 },
            accepted: { $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] } },
            booked: { $sum: { $cond: ['$isBooked', 1, 0] } }
          }
        },
        { $sort: { booked: -1, leads: -1 } },
        { $limit: 10 }
      ])
    ]);
    const partners = await Partner.find({ partnerId: { $in: leaders.map((l) => l._id) } }).select('partnerId name companyName');
    const nameById = new Map(partners.map((p) => [p.partnerId, p.companyName || p.name]));
    const leaderboard = leaders.map((l) => ({
      partnerId: l._id,
      name: nameById.get(l._id) || l._id,
      leads: l.leads,
      accepted: l.accepted,
      booked: l.booked,
      conversionRate: l.accepted ? Math.round((l.booked / l.accepted) * 1000) / 10 : 0
    }));

    return res.json({
      openDisputes,
      cancelledBookings,
      registrationTrend: trend.map((t) => ({ date: t._id, count: t.count })),
      leaderboard,
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
