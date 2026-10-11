import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/channel-partner';

const client = axios.create({ baseURL: BASE_URL, headers: { 'X-Client-Platform': 'WEB' } });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('partnerToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('partnerToken');
      localStorage.removeItem('partnerUser');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Original, unauthenticated demo/integration surface (spec section 6) - kept
// as-is for the simulated-external-CRM flow and the builder persona.
export const registerCustomer = (payload) => client.post('/registrations', payload);

export const getRegistration = (registrationId, view = 'partner') =>
  client.get(`/registrations/${registrationId}`, { params: { view } });

export const updateProgress = (registrationId, payload) =>
  client.post(`/registrations/${registrationId}/progress`, payload);

export const createBooking = (registrationId, payload = {}) =>
  client.post(`/registrations/${registrationId}/booking`, payload);

export const getAuditTimeline = (registrationId) => client.get(`/registrations/${registrationId}/audit`);

export const getCommissionEligibility = (registrationId) => client.get(`/registrations/${registrationId}/commission`);

export const checkDuplicate = (payload) => client.post('/duplicate-check', payload);

// Channel partner self-service (spec section 31) - register, log in, then
// manage only your own leads via the /my/* endpoints, JWT-protected.
export const registerPartner = (payload) => client.post('/partners/register', payload);
export const loginPartner = (username, password) => client.post('/partners/login', { username, password });
export const getMyProfile = () => client.get('/my/profile');
export const updateMyProfile = (payload) => client.patch('/my/profile', payload);

export const listMyRegistrations = () => client.get('/my/registrations');
export const createMyRegistration = (payload) => client.post('/my/registrations', payload);
export const getMyRegistration = (registrationId) => client.get(`/my/registrations/${registrationId}`);
export const updateMyRegistration = (registrationId, payload) => client.patch(`/my/registrations/${registrationId}`, payload);
export const updateMyProgress = (registrationId, payload) => client.post(`/my/registrations/${registrationId}/progress`, payload);
export const createMyBooking = (registrationId, payload = {}) => client.post(`/my/registrations/${registrationId}/booking`, payload);
export const getMyRegistrationAudit = (registrationId) => client.get(`/my/registrations/${registrationId}/audit`);
export const assignRegistration = (registrationId, assignedTo) => client.patch(`/my/registrations/${registrationId}/assign`, { assignedTo });

export const getGridPreferences = (gridKey) => client.get(`/my/grid-preferences/${gridKey}`);
export const updateGridPreferences = (gridKey, prefs) => client.patch(`/my/grid-preferences/${gridKey}`, prefs);

// Manage Team (spec section 32) - readable by the whole team, mutable only
// by whoever holds the MANAGE_TEAM permission (enforced server-side too).
export const listTeam = () => client.get('/my/team');
export const listAssignableUsers = () => client.get('/my/assignable-users');
export const listLeadStatuses = () => client.get('/my/lead-statuses');
export const createLeadStatus = (payload) => client.post('/my/lead-statuses', payload);
export const updateLeadStatus = (statusId, payload) => client.patch(`/my/lead-statuses/${statusId}`, payload);
export const deleteLeadStatus = (statusId) => client.delete(`/my/lead-statuses/${statusId}`);
export const listNotificationRules = () => client.get('/my/notification-rules');
export const createNotificationRule = (payload) => client.post('/my/notification-rules', payload);
export const updateNotificationRule = (ruleId, payload) => client.patch(`/my/notification-rules/${ruleId}`, payload);
export const deleteNotificationRule = (ruleId) => client.delete(`/my/notification-rules/${ruleId}`);
export const testNotificationRule = (ruleId, registrationId) => client.post(`/my/notification-rules/${ruleId}/test`, { registrationId });
export const listNotificationJobs = (params) => client.get('/my/notification-jobs', { params });
export const listMyNotifications = () => client.get('/my/notifications');
export const markNotificationRead = (notificationId) => client.post(`/my/notifications/${notificationId}/read`);
export const getTeamMember = (memberId) => client.get(`/my/team/${memberId}`);
export const createTeamMember = (payload) => client.post('/my/team', payload);
export const updateTeamMember = (memberId, payload) => client.patch(`/my/team/${memberId}`, payload);
export const deleteTeamMember = (memberId) => client.delete(`/my/team/${memberId}`);

// Roles & Permissions (spec section 34) - readable by the whole team,
// mutable only by whoever holds MANAGE_ROLES.
export const listRoles = () => client.get('/my/roles');
export const createRole = (payload) => client.post('/my/roles', payload);
export const updateRole = (roleId, payload) => client.patch(`/my/roles/${roleId}`, payload);
export const deleteRole = (roleId) => client.delete(`/my/roles/${roleId}`);

// Lead Module Settings (spec section 36) - readable by the whole team
// (drives the Register Lead form + My Leads filters for everyone),
// mutable only by whoever holds MANAGE_SETTINGS.
export const listLeadFields = () => client.get('/my/lead-fields');
export const createLeadField = (payload) => client.post('/my/lead-fields', payload);
export const updateLeadField = (fieldKey, payload) => client.patch(`/my/lead-fields/${fieldKey}`, payload);
export const deleteLeadField = (fieldKey) => client.delete(`/my/lead-fields/${fieldKey}`);

export const listUserFields = () => client.get('/my/user-fields');
export const createUserField = (payload) => client.post('/my/user-fields', payload);
export const updateUserField = (fieldKey, payload) => client.patch(`/my/user-fields/${fieldKey}`, payload);
export const deleteUserField = (fieldKey) => client.delete(`/my/user-fields/${fieldKey}`);

// Integrations module (section 43): inbound API key + outbound webhooks.
export const getIntegrationApiKey = () => client.get('/my/integrations/api-key');
export const regenerateIntegrationApiKey = () => client.post('/my/integrations/api-key/regenerate');

export const listWebhooks = () => client.get('/my/integrations/webhooks');
export const createWebhook = (payload) => client.post('/my/integrations/webhooks', payload);
export const updateWebhook = (webhookId, payload) => client.patch(`/my/integrations/webhooks/${webhookId}`, payload);
export const deleteWebhook = (webhookId) => client.delete(`/my/integrations/webhooks/${webhookId}`);
export const resyncWebhook = (webhookId, payload) => client.post(`/my/integrations/webhooks/${webhookId}/resync`, payload);

export const listDeliveries = (params) => client.get('/my/integrations/deliveries', { params });
export const retryDelivery = (deliveryId) => client.post(`/my/integrations/deliveries/${deliveryId}/retry`);
export const testWebhook = (webhookId, payload = {}) => client.post(`/my/integrations/webhooks/${webhookId}/test`, payload);

// Receive & Pull sources (section 51): leads in from any system, in its own format.
export const listIntegrationSources = () => client.get('/my/integrations/sources');
export const createIntegrationSource = (payload) => client.post('/my/integrations/sources', payload);
export const updateIntegrationSource = (sourceId, payload) => client.patch(`/my/integrations/sources/${sourceId}`, payload);
export const deleteIntegrationSource = (sourceId) => client.delete(`/my/integrations/sources/${sourceId}`);
export const regenerateSourceKey = (sourceId) => client.post(`/my/integrations/sources/${sourceId}/regenerate-key`);
export const testIntegrationSource = (sourceId, payload = {}) => client.post(`/my/integrations/sources/${sourceId}/test`, payload);
export const runIntegrationSource = (sourceId) => client.post(`/my/integrations/sources/${sourceId}/run`);
export const listInboundEvents = (params) => client.get('/my/integrations/inbound-events', { params });

export default client;
