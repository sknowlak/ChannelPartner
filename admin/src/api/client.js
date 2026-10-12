import axios from 'axios';

// This client only ever talks to /api/admin - entirely separate from the
// partner/builder-facing API used by frontend/ and mobile/.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/admin';

const client = axios.create({ baseURL: BASE_URL, headers: { 'X-Client-Platform': 'ADMIN' } });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const login = (email, password) => client.post('/auth/login', { email, password });
// The signed-in admin's own record, incl. the saved UI language (section 54).
export const getMe = () => client.get('/auth/me');
export const updateMe = (payload) => client.patch('/auth/me', payload);

export const getDashboard = () => client.get('/dashboard');

export const listPartners = (params) => client.get('/partners', { params });
export const createPartner = (payload) => client.post('/partners', payload);
export const getPartner = (partnerId) => client.get(`/partners/${partnerId}`);
export const updatePartner = (partnerId, payload) => client.patch(`/partners/${partnerId}`, payload);
export const getPartnerActivity = (partnerId) => client.get(`/partners/${partnerId}/activity`);

export const listFieldDefinitions = () => client.get('/field-definitions');
export const createFieldDefinition = (payload) => client.post('/field-definitions', payload);
export const updateFieldDefinition = (fieldKey, payload) => client.patch(`/field-definitions/${fieldKey}`, payload);
export const deleteFieldDefinition = (fieldKey) => client.delete(`/field-definitions/${fieldKey}`);

export const listRegistrations = (params) => client.get('/registrations', { params });
export const getRegistration = (registrationId) => client.get(`/registrations/${registrationId}`);
export const getRegistrationAudit = (registrationId) => client.get(`/registrations/${registrationId}/audit`);
export const overrideRegistration = (registrationId, payload) =>
  client.post(`/registrations/${registrationId}/override`, payload);

export const listAudit = (params) => client.get('/audit', { params });

// Builders, builder portal users and projects (section 52).
export const listBuilders = () => client.get('/builders');
export const createBuilder = (payload) => client.post('/builders', payload);
export const getBuilder = (builderId) => client.get(`/builders/${builderId}`);
export const updateBuilder = (builderId, payload) => client.patch(`/builders/${builderId}`, payload);
export const createBuilderUser = (builderId, payload) => client.post(`/builders/${builderId}/users`, payload);
export const updateBuilderUser = (builderUserId, payload) => client.patch(`/builder-users/${builderUserId}`, payload);
export const createProject = (payload) => client.post('/projects', payload);
export const updateProject = (projectId, payload) => client.patch(`/projects/${projectId}`, payload);

export const getSettings = () => client.get('/settings');
export const updateSettings = (payload) => client.put('/settings', payload);

export default client;
