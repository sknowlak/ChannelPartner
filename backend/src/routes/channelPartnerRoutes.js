const express = require('express');
const { createRegistration, getRegistration, updateProgress } = require('../controllers/registrationController');
const { checkDuplicate } = require('../controllers/duplicateController');
const { createBooking } = require('../controllers/bookingController');
const { getAuditTimeline } = require('../controllers/auditController');
const { getCommissionEligibility } = require('../controllers/commissionController');
const partnerAuthController = require('../controllers/partnerAuthController');
const myLeadsController = require('../controllers/myLeadsController');
const teamController = require('../controllers/teamController');
const roleController = require('../controllers/roleController');
const leadFieldController = require('../controllers/leadFieldController');
const userFieldController = require('../controllers/userFieldController');
const integrationController = require('../controllers/integrationController');
const gridPreferencesController = require('../controllers/gridPreferencesController');
const partnerAuth = require('../middleware/partnerAuth');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const { requirePermission } = partnerAuth;
const { PERMISSIONS } = require('../config/permissions');

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

// Integrations module inbound surface (section 43) - "I can receive lead[s]
// or lead progress updates" from the partner's own external system,
// authenticated by their Integrations API key rather than a login session.
// Reuses the exact same handlers as the /my/* routes below - they only ever
// read req.partnerId/req.actorLabel, which apiKeyAuth sets the same way
// partnerAuth does.
router.post('/integrations/leads', apiKeyAuth, myLeadsController.createMyRegistration);
router.post('/integrations/leads/:registrationId/progress', apiKeyAuth, myLeadsController.updateMyProgress);

// Channel partner self-service: register/login, then manage only your own
// leads. See spec section 31.
router.post('/partners/register', partnerAuthController.register);
router.post('/partners/login', partnerAuthController.login);

router.get('/my/profile', partnerAuth, partnerAuthController.getMyProfile);
router.patch('/my/profile', partnerAuth, partnerAuthController.updateMyProfile);

// Viewing the shared lead pool is never gated (spec section 32); creating/
// progressing/booking a lead requires MANAGE_LEADS (section 34).
router.get('/my/registrations', partnerAuth, myLeadsController.listMyRegistrations);
router.post('/my/registrations', partnerAuth, requirePermission(PERMISSIONS.MANAGE_LEADS), myLeadsController.createMyRegistration);
router.get('/my/registrations/:registrationId', partnerAuth, myLeadsController.getMyRegistration);
router.patch('/my/registrations/:registrationId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_LEADS), myLeadsController.updateMyRegistration);
router.post('/my/registrations/:registrationId/progress', partnerAuth, requirePermission(PERMISSIONS.MANAGE_LEADS), myLeadsController.updateMyProgress);
router.post('/my/registrations/:registrationId/booking', partnerAuth, requirePermission(PERMISSIONS.MANAGE_LEADS), myLeadsController.createMyBooking);
router.get('/my/registrations/:registrationId/audit', partnerAuth, myLeadsController.getMyRegistrationAudit);
router.patch('/my/registrations/:registrationId/assign', partnerAuth, requirePermission(PERMISSIONS.MANAGE_LEADS), myLeadsController.assignRegistration);

router.get('/my/grid-preferences/:gridKey', partnerAuth, gridPreferencesController.getGridPreferences);
router.patch('/my/grid-preferences/:gridKey', partnerAuth, gridPreferencesController.updateGridPreferences);

// Manage Team (section 32): readable by the whole team, mutable only by
// whoever holds MANAGE_TEAM (the owner's Super Admin role always does).
router.get('/my/team', partnerAuth, teamController.listTeam);
router.get('/my/team/:memberId', partnerAuth, teamController.getTeamMember);
router.post('/my/team', partnerAuth, requirePermission(PERMISSIONS.MANAGE_TEAM), teamController.createTeamMember);
router.patch('/my/team/:memberId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_TEAM), teamController.updateTeamMember);
router.delete('/my/team/:memberId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_TEAM), teamController.deleteTeamMember);

// Roles & Permissions (section 34): readable by the whole team (needed for
// role pickers), mutable only by whoever holds MANAGE_ROLES.
router.get('/my/roles', partnerAuth, roleController.list);
router.post('/my/roles', partnerAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), roleController.create);
router.patch('/my/roles/:roleId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), roleController.update);
router.delete('/my/roles/:roleId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_ROLES), roleController.remove);

// Lead Module Settings (section 36): readable by the whole team (needed to
// render the Register Lead form and My Leads filters identically for
// everyone), mutable only by whoever holds MANAGE_SETTINGS.
router.get('/my/lead-fields', partnerAuth, leadFieldController.list);
router.post('/my/lead-fields', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), leadFieldController.create);
router.patch('/my/lead-fields/:fieldKey', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), leadFieldController.update);
router.delete('/my/lead-fields/:fieldKey', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), leadFieldController.remove);

// User Module Settings (section 38): readable by the whole team (needed to
// render the Add/Edit Team Member forms identically for everyone), mutable
// only by whoever holds MANAGE_SETTINGS.
router.get('/my/user-fields', partnerAuth, userFieldController.list);
router.post('/my/user-fields', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), userFieldController.create);
router.patch('/my/user-fields/:fieldKey', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), userFieldController.update);
router.delete('/my/user-fields/:fieldKey', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), userFieldController.remove);

// Integrations module outbound/admin surface (section 43): push-lead
// webhooks, their delivery log, and the inbound API key - readable by the
// whole team (so anyone can see what's configured), mutable only by
// whoever holds MANAGE_SETTINGS, same rule as Lead/User field settings.
router.get('/my/integrations/api-key', partnerAuth, integrationController.getApiKey);
router.post('/my/integrations/api-key/regenerate', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.regenerateApiKey);

router.get('/my/integrations/webhooks', partnerAuth, integrationController.listWebhooks);
router.post('/my/integrations/webhooks', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.createWebhook);
router.patch('/my/integrations/webhooks/:webhookId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.updateWebhook);
router.delete('/my/integrations/webhooks/:webhookId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.deleteWebhook);
router.post('/my/integrations/webhooks/:webhookId/resync', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.resyncHandler);

router.get('/my/integrations/deliveries', partnerAuth, integrationController.listDeliveries);
router.post('/my/integrations/deliveries/:deliveryId/retry', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.retryDeliveryHandler);

module.exports = router;
