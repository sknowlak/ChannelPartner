const express = require('express');
const { createRegistration, getRegistration, updateProgress } = require('../controllers/registrationController');
const { checkDuplicate } = require('../controllers/duplicateController');
const { createBooking } = require('../controllers/bookingController');
const { getAuditTimeline } = require('../controllers/auditController');
const { getCommissionEligibility } = require('../controllers/commissionController');
const partnerAuthController = require('../controllers/partnerAuthController');
const myLeadsController = require('../controllers/myLeadsController');
const teamController = require('../controllers/teamController');
const partnerAuth = require('../middleware/partnerAuth');
const { requireOwner } = partnerAuth;

const router = express.Router();

// Original, unauthenticated surface - server-to-server / simulated external
// CRM registrations (spec section 6). Left untouched for backward
// compatibility; identity is asserted by the caller, not by a login session.
router.post('/registrations', createRegistration);
router.get('/registrations/:registrationId', getRegistration);
router.post('/registrations/:registrationId/progress', updateProgress);
router.post('/registrations/:registrationId/booking', createBooking);
router.get('/registrations/:registrationId/audit', getAuditTimeline);
router.get('/registrations/:registrationId/commission', getCommissionEligibility);
router.post('/duplicate-check', checkDuplicate);

// Channel partner self-service: register/login, then manage only your own
// leads. See spec section 31.
router.post('/partners/register', partnerAuthController.register);
router.post('/partners/login', partnerAuthController.login);

router.get('/my/profile', partnerAuth, partnerAuthController.getMyProfile);
router.patch('/my/profile', partnerAuth, partnerAuthController.updateMyProfile);

router.get('/my/registrations', partnerAuth, myLeadsController.listMyRegistrations);
router.post('/my/registrations', partnerAuth, myLeadsController.createMyRegistration);
router.get('/my/registrations/:registrationId', partnerAuth, myLeadsController.getMyRegistration);
router.post('/my/registrations/:registrationId/progress', partnerAuth, myLeadsController.updateMyProgress);
router.post('/my/registrations/:registrationId/booking', partnerAuth, myLeadsController.createMyBooking);
router.get('/my/registrations/:registrationId/audit', partnerAuth, myLeadsController.getMyRegistrationAudit);

// Manage Team (section 32): readable by the whole team, mutable by the
// account owner only.
router.get('/my/team', partnerAuth, teamController.listTeam);
router.get('/my/team/:memberId', partnerAuth, teamController.getTeamMember);
router.post('/my/team', partnerAuth, requireOwner, teamController.createTeamMember);
router.patch('/my/team/:memberId', partnerAuth, requireOwner, teamController.updateTeamMember);
router.delete('/my/team/:memberId', partnerAuth, requireOwner, teamController.deleteTeamMember);

module.exports = router;
