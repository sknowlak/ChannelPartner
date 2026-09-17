import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/channel-partner';

const client = axios.create({ baseURL: BASE_URL });

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
export const updateMyProgress = (registrationId, payload) => client.post(`/my/registrations/${registrationId}/progress`, payload);
export const createMyBooking = (registrationId, payload = {}) => client.post(`/my/registrations/${registrationId}/booking`, payload);
export const getMyRegistrationAudit = (registrationId) => client.get(`/my/registrations/${registrationId}/audit`);

// Manage Team (spec section 32) - readable by the whole team, mutable only
// by the account owner (enforced server-side too).
export const listTeam = () => client.get('/my/team');
export const getTeamMember = (memberId) => client.get(`/my/team/${memberId}`);
export const createTeamMember = (payload) => client.post('/my/team', payload);
export const updateTeamMember = (memberId, payload) => client.patch(`/my/team/${memberId}`, payload);
export const deleteTeamMember = (memberId) => client.delete(`/my/team/${memberId}`);

export default client;
