const Registration = require('../models/Registration');
const Booking = require('../models/Booking');
const CommissionEligibility = require('../models/CommissionEligibility');
const Dispute = require('../models/Dispute');

// The partner's own dashboard (section 62): pipeline, conversion, recent
// activity and the leads whose protection runs out soon - all scoped to the
// partner's own registrations, like My Leads.

const DAY = 24 * 60 * 60 * 1000;
const EXPIRING_WITHIN_DAYS = 7;

function validTimezone(tz) {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz }); // eslint-disable-line no-new
    return tz;
  } catch {
    return 'UTC';
  }
}

const countsBy = (rows) => rows.map((r) => ({ key: r._id || '', count: r.count })).sort((a, b) => b.count - a.count);

// GET /api/channel-partner/my/dashboard?days=30&tz=Asia/Kolkata
async function getMyDashboard(req, res, next) {
  try {
    const { partnerId } = req;
    const days = Math.min(365, Math.max(7, Number.parseInt(req.query.days, 10) || 30));
    const timezone = validTimezone(String(req.query.tz || '').slice(0, 64));
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY);
    const soon = new Date(now.getTime() + EXPIRING_WITHIN_DAYS * DAY);

    const [facets] = await Registration.aggregate([
      { $match: { partnerId } },
      {
        $facet: {
          total: [{ $count: 'n' }],
          accepted: [{ $match: { status: 'ACCEPTED' } }, { $count: 'n' }],
          booked: [{ $match: { isBooked: true } }, { $count: 'n' }],
          protectedNow: [{ $match: { status: 'ACCEPTED', isBooked: false, protectionExpiry: { $gt: now } } }, { $count: 'n' }],
          disputedNow: [{ $match: { disputeStatus: 'OPEN' } }, { $count: 'n' }],
          newInPeriod: [{ $match: { registeredAt: { $gte: since } } }, { $count: 'n' }],
          byStage: [{ $group: { _id: '$currentStage', count: { $sum: 1 } } }],
          bySource: [{ $group: { _id: '$source', count: { $sum: 1 } } }],
          byReferral: [{ $group: { _id: '$referralStatus', count: { $sum: 1 } } }],
          trend: [
            { $match: { registeredAt: { $gte: since } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$registeredAt', timezone } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
          ],
          expiringSoon: [
            { $match: { status: 'ACCEPTED', isBooked: false, protectionExpiry: { $gt: now, $lte: soon } } },
            { $sort: { protectionExpiry: 1 } },
            { $limit: 10 },
            { $project: { _id: 0, registrationId: 1, customerName: '$contact.name', projectId: 1, currentStage: 1, protectionExpiry: 1 } }
          ],
          expiringSoonCount: [
            { $match: { status: 'ACCEPTED', isBooked: false, protectionExpiry: { $gt: now, $lte: soon } } },
            { $count: 'n' }
          ]
        }
      }
    ]);
    const n = (key) => facets[key][0]?.n || 0;

    const bookedIds = (await Registration.find({ partnerId, isBooked: true }).select('registrationId')).map((r) => r.registrationId);
    const [bookingTrend, commissionRows, disputeRows] = await Promise.all([
      Booking.aggregate([
        { $match: { registrationId: { $in: bookedIds }, status: 'CONFIRMED', bookingDate: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$bookingDate', timezone } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      CommissionEligibility.aggregate([{ $match: { partnerId } }, { $group: { _id: '$eligibilityStatus', count: { $sum: 1 } } }]),
      Dispute.aggregate([{ $match: { partnerId } }, { $group: { _id: '$status', count: { $sum: 1 } } }])
    ]);

    const accepted = n('accepted');
    const booked = n('booked');
    const byKey = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.count]));

    return res.json({
      periodDays: days,
      timezone,
      totals: {
        leads: n('total'),
        accepted,
        booked,
        protectedNow: n('protectedNow'),
        expiringSoon: n('expiringSoonCount'),
        disputedNow: n('disputedNow'),
        newInPeriod: n('newInPeriod'),
        bookedInPeriod: bookingTrend.reduce((sum, r) => sum + r.count, 0),
        // Share of accepted leads that became bookings, one decimal.
        conversionRate: accepted ? Math.round((booked / accepted) * 1000) / 10 : 0
      },
      commission: byKey(commissionRows),
      disputes: byKey(disputeRows),
      byStage: countsBy(facets.byStage),
      bySource: countsBy(facets.bySource),
      byReferral: countsBy(facets.byReferral),
      trend: { registrations: facets.trend.map((r) => ({ date: r._id, count: r.count })), bookings: bookingTrend.map((r) => ({ date: r._id, count: r.count })) },
      expiringSoon: facets.expiringSoon,
      expiringWithinDays: EXPIRING_WITHIN_DAYS
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyDashboard };
