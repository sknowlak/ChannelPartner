const CommissionEligibility = require('../models/CommissionEligibility');

// GET /api/channel-partner/registrations/:registrationId/commission
async function getCommissionEligibility(req, res, next) {
  try {
    const { registrationId } = req.params;
    const commission = await CommissionEligibility.findOne({ registrationId });
    if (!commission) return res.status(404).json({ reason: 'No commission eligibility record for this registration' });
    return res.json(commission);
  } catch (err) {
    next(err);
  }
}

module.exports = { getCommissionEligibility };
