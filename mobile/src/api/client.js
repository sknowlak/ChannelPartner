import axios from 'axios';
import Constants from 'expo-constants';

// On a physical device 'localhost' resolves to the device itself, not your
// dev machine - set expo.extra.apiBaseUrl in app.json to your machine's LAN
// IP (e.g. http://192.168.1.50:5000/api/channel-partner) when testing off-simulator.
const BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || 'http://localhost:5000/api/channel-partner';

const client = axios.create({ baseURL: BASE_URL, headers: { 'X-Client-Platform': 'MOBILE' } });

export const registerCustomer = (payload) => client.post('/registrations', payload);

export const getRegistration = (registrationId, view = 'partner') =>
  client.get(`/registrations/${registrationId}`, { params: { view } });

export const getStatuses = (registrationId) => client.get(`/registrations/${registrationId}/statuses`);
export const updateProgress = (registrationId, payload) =>
  client.post(`/registrations/${registrationId}/progress`, payload);

export const createBooking = (registrationId, payload = {}) =>
  client.post(`/registrations/${registrationId}/booking`, payload);

export const getAuditTimeline = (registrationId) => client.get(`/registrations/${registrationId}/audit`);

export default client;
