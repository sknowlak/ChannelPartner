const { findDuplicate } = require('../services/duplicateService');
const { validateMobileField } = require('../utils/phone');

// POST /api/channel-partner/my/duplicate-check (logged-in partner)
// Pre-checks a customer before registering (spec section 17). Used to be
// public and returned the protecting partner's ID - letting anyone map which
// partner holds which customer. Now it needs a session, and the answer is
// only "protected or not, and until when" (section 52).
async function checkDuplicate(req, res, next) {
  try {
    const { customer } = req.body;
    if (!customer || typeof customer !== 'object' || !customer.mobile) {
      return res.status(400).json({ reason: 'customer.mobile is required', fieldKey: 'mobile' });
    }
    const mobileCheck = validateMobileField(customer.mobile, customer.mobileCountry);
    if (!mobileCheck.valid) return res.status(400).json({ reason: mobileCheck.reason, fieldKey: 'mobile', code: mobileCheck.code });

    const duplicate = await findDuplicate({
      mobile: mobileCheck.e164,
      email: customer.email,
      alternateMobile: customer.alternateMobile,
      projectId: req.body.projectId
    });
    if (!duplicate) return res.json({ isDuplicate: false });
    return res.json({
      isDuplicate: true,
      reasonCode: 'DUPLICATE_PROTECTED',
      protectedUntil: duplicate.protectionExpiry,
      ownedByYou: duplicate.partnerId === req.partnerId
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { checkDuplicate };
