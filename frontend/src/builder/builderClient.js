import axios from 'axios';

// The builder portal's own API client and session (section 52) - a builder
// token is a different token type from a partner's, kept under its own
// storage key so the two sessions never mix in one browser.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/channel-partner').replace(/\/channel-partner\/?$/, '/builder');

const client = axios.create({ baseURL: BASE_URL, headers: { 'X-Client-Platform': 'WEB' } });

export function getBuilderSession() {
  try {
    const user = JSON.parse(localStorage.getItem('builderUser') || 'null');
    return localStorage.getItem('builderToken') && user ? user : null;
  } catch {
    return null;
  }
}
// builderUser holds display fields only (incl. the UI language) - never credentials.
export function setBuilderSession(token, user) {
  localStorage.setItem('builderToken', token);
  localStorage.setItem('builderUser', JSON.stringify({ name: user.name, email: user.email, builderId: user.builderId, language: user.language || '' }));
}
export function updateBuilderSessionUser(patch) {
  const user = getBuilderSession();
  if (!user) return;
  try {
    localStorage.setItem('builderUser', JSON.stringify({ ...user, ...patch }));
  } catch {
    /* storage unavailable - nothing to update */
  }
}
export function clearBuilderSession() {
  localStorage.removeItem('builderToken');
  localStorage.removeItem('builderUser');
}

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('builderToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== '/builder/login') {
      clearBuilderSession();
      window.location.href = '/builder/login';
    }
    return Promise.reject(err);
  }
);

export const builderLogin = (email, password) => client.post('/auth/login', { email, password });
export const getBuilderMe = () => client.get('/me');
export const updateBuilderMe = (body) => client.patch('/me', body);
export const listBuilderProjects = () => client.get('/projects');
export const listReferrals = (params) => client.get('/referrals', { params });
export const getReferral = (id) => client.get(`/referrals/${id}`);
export const decideReferral = (id, decision, reason) => client.post(`/referrals/${id}/decision`, { decision, reason });
export const bookReferral = (id) => client.post(`/referrals/${id}/booking`, {});
export const getReferralAudit = (id) => client.get(`/referrals/${id}/audit`);
