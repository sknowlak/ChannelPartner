const { findDuplicate } = require('../services/duplicateService');

// POST /api/channel-partner/duplicate-check
// Standalone check - does not create a registration, used to pre-validate
// before a partner submits (spec section 17).
async function checkDuplicate(req, res, next) {
  try {
    const { customer, projectId } = req.body;
    if (!customer || !customer.mobile || !projectId) {
      return res.status(400).json({ reason: 'customer.mobile and projectId are required' });
    }

    const duplicate = await findDuplicate({ mobile: customer.mobile, email: customer.email, projectId });

    if (!duplicate) {
      return res.json({ isDuplicate: false });
    }

    return res.json({
      isDuplicate: true,
      reasonCode: 'DUPLICATE_PROTECTED',
      existingPartnerId: duplicate.partnerId,
      protectedUntil: duplicate.protectionExpiry
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { checkDuplicate };
