const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const { requireSuperAdmin } = require('../middleware/adminAuth');
const { loginRateLimit } = require('../middleware/rateLimit');
const { login, me, updateMe } = require('../controllers/admin/authController');
const {
  listPartners,
  createPartner,
  getPartner,
  updatePartner,
  getPartnerActivity
} = require('../controllers/admin/partnerController');
const {
  listRegistrations,
  getRegistration,
  getRegistrationAudit,
  overrideRegistration
} = require('../controllers/admin/registrationController');
const { listAudit } = require('../controllers/admin/auditController');
const { getSettingsHandler, updateSettingsHandler } = require('../controllers/admin/settingsController');
const { getDashboardSummary } = require('../controllers/admin/dashboardController');
const fieldDefinitionController = require('../controllers/admin/fieldDefinitionController');
const builderAdmin = require('../controllers/admin/builderAdminController');

const router = express.Router();

// Public
router.post('/auth/login', loginRateLimit, login);

// Everything below requires a valid admin bearer token
router.use(adminAuth);

router.get('/auth/me', me);
router.patch('/auth/me', updateMe);

router.get('/dashboard', getDashboardSummary);

router.get('/partners', listPartners);
router.post('/partners', requireSuperAdmin, createPartner);
router.get('/partners/:partnerId', getPartner);
router.patch('/partners/:partnerId', updatePartner);
router.get('/partners/:partnerId/activity', getPartnerActivity);

router.get('/field-definitions', fieldDefinitionController.list);
router.post('/field-definitions', requireSuperAdmin, fieldDefinitionController.create);
router.patch('/field-definitions/:fieldKey', requireSuperAdmin, fieldDefinitionController.update);
router.delete('/field-definitions/:fieldKey', requireSuperAdmin, fieldDefinitionController.remove);

router.get('/registrations', listRegistrations);
router.get('/registrations/:registrationId', getRegistration);
router.get('/registrations/:registrationId/audit', getRegistrationAudit);
router.post('/registrations/:registrationId/override', overrideRegistration);

router.get('/audit', listAudit);

// Builders, their portal users and projects (section 52) - Super Admin only
// for changes, since they decide who can see which referrals.
router.get('/builders', builderAdmin.listBuilders);
router.post('/builders', requireSuperAdmin, builderAdmin.createBuilder);
router.get('/builders/:builderId', builderAdmin.getBuilder);
router.patch('/builders/:builderId', requireSuperAdmin, builderAdmin.updateBuilder);
router.post('/builders/:builderId/users', requireSuperAdmin, builderAdmin.createBuilderUser);
router.patch('/builder-users/:builderUserId', requireSuperAdmin, builderAdmin.updateBuilderUser);
router.get('/projects', builderAdmin.listProjects);
router.post('/projects', requireSuperAdmin, builderAdmin.createProject);
router.patch('/projects/:projectId', requireSuperAdmin, builderAdmin.updateProject);

router.get('/settings', getSettingsHandler);
router.put('/settings', requireSuperAdmin, updateSettingsHandler);

module.exports = router;
