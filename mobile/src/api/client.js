import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

// API address (section 52): EXPO_PUBLIC_API_BASE_URL at build time, or
// expo.extra.apiBaseUrl in app.json. Release builds must use https:// -
// partner credentials and customer details would otherwise travel in clear
// text over the network. Plain http is only accepted in development (e.g. a
// laptop's LAN address while testing on a phone).
const configured = process.env.EXPO_PUBLIC_API_BASE_URL || Constants.expoConfig?.extra?.apiBaseUrl || '';
const BASE_URL = configured || (__DEV__ ? 'http://localhost:5000/api/channel-partner' : '');

export const API_CONFIG_ERROR = !BASE_URL
  ? 'The app has no API address configured (EXPO_PUBLIC_API_BASE_URL).'
  : !__DEV__ && !BASE_URL.startsWith('https://')
    ? 'This build points at an insecure (http://) API address. Release builds must use https://.'
    : null;

const client = axios.create({ baseURL: BASE_URL, headers: { 'X-Client-Platform': 'MOBILE' }, timeout: 20000 });

// The partner session token lives in the OS keychain/keystore, not in plain
// app storage, and is mirrored in memory for requests.
const TOKEN_KEY = 'partnerToken';
let token = null;
let onSignedOut = () => {};

export async function loadSession() {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return !!token;
}
export async function saveSession(newToken) {
  token = newToken;
  await SecureStore.setItemAsync(TOKEN_KEY, newToken);
}
export async function clearSession() {
  token = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
export function setSignedOutHandler(fn) {
  onSignedOut = fn;
}

client.interceptors.request.use((config) => {
  if (API_CONFIG_ERROR) throw new Error(API_CONFIG_ERROR);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
client.interceptors.response.use(
  (res) => res,
  async (err) => {
    // Expired/revoked session (password changed, account deactivated).
    if (err.response?.status === 401 && token) {
      await clearSession();
      onSignedOut();
    }
    return Promise.reject(err);
  }
);

// Partner session API only - the old unauthenticated /registrations*
// routes this app used to call were removed (section 52).
export const login = (username, password) => client.post('/partners/login', { username, password });
export const listMyLeads = () => client.get('/my/registrations');
export const createLead = (payload) => client.post('/my/registrations', payload);
export const getLead = (registrationId) => client.get(`/my/registrations/${registrationId}`);
export const getLeadAudit = (registrationId) => client.get(`/my/registrations/${registrationId}/audit`);
export const updateLeadProgress = (registrationId, payload) => client.post(`/my/registrations/${registrationId}/progress`, payload);
export const listStatuses = () => client.get('/my/lead-statuses');
export const listProjects = () => client.get('/my/projects');
export const listLeadFields = () => client.get('/my/lead-fields');

export default client;
