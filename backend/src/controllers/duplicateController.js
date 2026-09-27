const { findDuplicate } = require('../services/duplicateService');
const { validateMobile } = require('../utils/phone');

// POST /api/channel-partner/duplicate-check
// Standalone check - does not create a registration, used to pre-validate
// before a partner submits (spec section 17).
async function checkDuplicate(req, res, next) {
  try {
    const { customer, projectId } = req.body;
    if (!customer || !customer.mobile || !projectId) {
      return res.status(400).json({ reason: 'customer.mobile and projectId are required' });
    }

    // Stored numbers all carry a country code now, so a bare number here
    // can't be matched against them reliably - reject rather than silently
    // answering "not a duplicate" when it might well be one.
    const mobileCheck = validateMobile(customer.mobile);
    if (!mobileCheck.valid) return res.status(400).json({ reason: mobileCheck.reason, fieldKey: 'mobile', code: mobileCheck.code });

    const duplicate = await findDuplicate({ mobile: mobileCheck.e164, email: customer.email, projectId });

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
