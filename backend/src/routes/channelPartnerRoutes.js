const express = require('express');
const { checkDuplicate } = require('../controllers/duplicateController');
const partnerAuthController = require('../controllers/partnerAuthController');
const myLeadsController = require('../controllers/myLeadsController');
const teamController = require('../controllers/teamController');
const roleController = require('../controllers/roleController');
const leadFieldController = require('../controllers/leadFieldController');
const leadStatusController = require('../controllers/leadStatusController');
const notificationController = require('../controllers/notificationController');
const userFieldController = require('../controllers/userFieldController');
const integrationController = require('../controllers/integrationController');
const gridPreferencesController = require('../controllers/gridPreferencesController');
const integrationSourceController = require('../controllers/integrationSourceController');
const openApiController = require('../controllers/openApiController');
const linkedinConnectorController = require('../controllers/linkedinConnectorController');
const partnerAuth = require('../middleware/partnerAuth');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const { requirePermission } = partnerAuth;
const { PERMISSIONS } = require('../config/permissions');
const { loginRateLimit, signupRateLimit } = require('../middleware/rateLimit');

const router = express.Router();

// Every route below needs a credential (section 52): a partner session
// (/my/*), the organisation's API key (/integrations/*), or a receive
// source's secret URL (/hooks/*). The original unauthenticated
// /registrations* and /duplicate-check routes were removed - anyone could
// read customer details, register as any partner, and book any lead
// through them. Builders use /api/builder (builderRoutes.js).

// Integrations module inbound surface (section 43) - "I can receive lead[s]
// or lead progress updates" from the partner's own external system,
// authenticated by their Integrations API key rather than a login session.
// Reuses the exact same handlers as the /my/* routes below - they only ever
// read req.partnerId/req.actorLabel, which apiKeyAuth sets the same way
// partnerAuth does.
router.post('/integrations/leads', apiKeyAuth, myLeadsController.createMyRegistration);
router.post('/integrations/leads/:registrationId/progress', apiKeyAuth, myLeadsController.updateMyProgress);

// The partner's open, two-way API (section 51): read leads/statuses/fields,
// update and book leads, and subscribe other systems to lead events - all
// with the API key. The OpenAPI document itself is public.
router.get('/integrations/openapi.json', openApiController.openApiSpec);
router.get('/integrations/leads', apiKeyAuth, openApiController.listLeads);
router.get('/integrations/leads/:registrationId', apiKeyAuth, openApiController.getLead);
router.patch('/integrations/leads/:registrationId', apiKeyAuth, myLeadsController.updateMyRegistration);
router.get('/integrations/lead-statuses', apiKeyAuth, openApiController.listLeadStatusesPublic);
router.get('/integrations/lead-fields', apiKeyAuth, openApiController.listLeadFieldsPublic);
router.get('/integrations/subscriptions', apiKeyAuth, openApiController.listSubscriptions);
router.post('/integrations/subscriptions', apiKeyAuth, openApiController.createSubscription);
router.delete('/integrations/subscriptions/:subscriptionId', apiKeyAuth, openApiController.deleteSubscription);

// Receive sources (section 51): any system posts leads in ITS OWN format to
// its source URL; the secret key in the URL is the credential. GET answers
// subscription handshakes (e.g. Facebook's hub.challenge).
router.post('/hooks/:sourceKey', integrationSourceController.receive);
router.get('/hooks/:sourceKey', integrationSourceController.verifyChallenge);

// LinkedIn connector (section 59): OAuth return URL and lead notification
// webhook. Public - the OAuth state / HMAC signature are the credentials.
router.get('/connectors/linkedin/callback', linkedinConnectorController.callback);
router.get('/connectors/linkedin/webhook', linkedinConnectorController.webhookChallenge);
router.post('/connectors/linkedin/webhook', linkedinConnectorController.webhookReceive);

// Channel partner self-service: register/login, then manage only your own
// leads. See spec section 31.
router.post('/partners/register', signupRateLimit, partnerAuthController.register);
router.post('/partners/login', loginRateLimit, partnerAuthController.login);

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
router.get('/my/assignable-users', partnerAuth, myLeadsController.listAssignableUsers);
router.get('/my/lead-statuses', partnerAuth, myLeadsController.listLeadStatuses);
router.get('/my/projects', partnerAuth, myLeadsController.listProjects);
router.post('/my/duplicate-check', partnerAuth, checkDuplicate);

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
// Lead statuses + notification rules (section 49) - read by the whole team,
// changed only with MANAGE_SETTINGS; the bell inbox is per user.
router.post('/my/lead-statuses', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), leadStatusController.create);
router.patch('/my/lead-statuses/:statusId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), leadStatusController.update);
router.delete('/my/lead-statuses/:statusId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), leadStatusController.remove);
router.get('/my/notification-rules', partnerAuth, notificationController.listRules);
router.post('/my/notification-rules', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), notificationController.createRule);
router.patch('/my/notification-rules/:ruleId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), notificationController.updateRule);
router.delete('/my/notification-rules/:ruleId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), notificationController.deleteRule);
router.post('/my/notification-rules/:ruleId/test', partnerAuth, notificationController.testRule);
router.get('/my/notification-jobs', partnerAuth, notificationController.listJobs);
router.get('/my/notifications', partnerAuth, notificationController.listMine);
router.post('/my/notifications/:notificationId/read', partnerAuth, notificationController.markRead);

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
// webhooks and their delivery log are readable by the whole team (header
// values masked unless you hold MANAGE_SETTINGS), mutable only by whoever
// holds MANAGE_SETTINGS. The inbound API key acts as the whole organisation
// (it skips per-member permissions), so even reading it needs MANAGE_SETTINGS.
router.get('/my/integrations/api-key', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.getApiKey);
router.post('/my/integrations/api-key/regenerate', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.regenerateApiKey);

router.get('/my/integrations/webhooks', partnerAuth, integrationController.listWebhooks);
router.post('/my/integrations/webhooks', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.createWebhook);
router.patch('/my/integrations/webhooks/:webhookId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.updateWebhook);
router.delete('/my/integrations/webhooks/:webhookId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.deleteWebhook);
router.post('/my/integrations/webhooks/:webhookId/resync', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.resyncHandler);

router.post('/my/integrations/webhooks/:webhookId/test', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.testWebhook);

// Receive & Pull sources (section 51) - same visibility rule as webhooks.
router.get('/my/integrations/sources', partnerAuth, integrationSourceController.listSources);
router.post('/my/integrations/sources', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationSourceController.createSource);
router.patch('/my/integrations/sources/:sourceId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationSourceController.updateSource);
router.delete('/my/integrations/sources/:sourceId', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationSourceController.deleteSource);
router.post('/my/integrations/sources/:sourceId/regenerate-key', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationSourceController.regenerateSourceKey);
router.post('/my/integrations/sources/:sourceId/test', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationSourceController.testSource);
router.post('/my/integrations/sources/:sourceId/run', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationSourceController.runSourceNow);
router.get('/my/integrations/inbound-events', partnerAuth, integrationSourceController.listInboundEvents);

router.get('/my/integrations/deliveries', partnerAuth, integrationController.listDeliveries);

// Connectors (section 59): Settings -> Connectors -> LinkedIn.
router.get('/my/connectors', partnerAuth, linkedinConnectorController.listConnectors);
router.get('/my/connectors/linkedin', partnerAuth, linkedinConnectorController.getLinkedIn);
router.get('/my/connectors/linkedin/stats', partnerAuth, linkedinConnectorController.stats);
router.get('/my/connectors/linkedin/activity', partnerAuth, linkedinConnectorController.activity);
router.post('/my/connectors/linkedin/connect', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), linkedinConnectorController.connect);
router.patch('/my/connectors/linkedin', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), linkedinConnectorController.updateSettings);
router.post('/my/connectors/linkedin/accounts/refresh', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), linkedinConnectorController.refreshAccounts);
router.post('/my/connectors/linkedin/sync', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), linkedinConnectorController.syncNow);
router.post('/my/connectors/linkedin/fetch-range', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), linkedinConnectorController.fetchRange);
router.post('/my/connectors/linkedin/conversion-rules', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), linkedinConnectorController.addConversionRule);
router.delete('/my/connectors/linkedin', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), linkedinConnectorController.disconnect);
router.post('/my/integrations/deliveries/:deliveryId/retry', partnerAuth, requirePermission(PERMISSIONS.MANAGE_SETTINGS), integrationController.retryDeliveryHandler);

module.exports = router;
