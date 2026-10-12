const express = require('express');
const builderAuth = require('../middleware/builderAuth');
const { loginRateLimit } = require('../middleware/rateLimit');
const builderController = require('../controllers/builderController');

// The builder portal API (section 52). Everything except login needs a
// builder session, and every referral route is scoped to the builder's own
// projects inside the controller.
const router = express.Router();

router.post('/auth/login', loginRateLimit, builderController.login);

router.use(builderAuth);
router.get('/me', builderController.me);
router.patch('/me', builderController.updateMe);
router.patch('/me/password', builderController.changePassword);
router.get('/projects', builderController.listProjects);
router.get('/referrals', builderController.listReferrals);
router.get('/referrals/:registrationId', builderController.getReferral);
router.post('/referrals/:registrationId/decision', builderController.decideReferral);
router.post('/referrals/:registrationId/booking', builderController.bookReferral);
router.get('/referrals/:registrationId/audit', builderController.getReferralAudit);

module.exports = router;
