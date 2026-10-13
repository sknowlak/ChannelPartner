// End-to-end: LinkedIn connector (spec section 59) against the mock LinkedIn.
//   node tests/e2e/mockLinkedIn.mjs            (port 5056)
//   backend with LINKEDIN_CLIENT_ID=mock-client LINKEDIN_CLIENT_SECRET=mock-secret
//     LINKEDIN_AUTH_BASE=http://127.0.0.1:5056/oauth/v2 LINKEDIN_API_BASE=http://127.0.0.1:5056/rest
//   E2E_API_URL=http://localhost:5000/api node tests/e2e/linkedin.e2e.mjs
// Creates a synthetic partner and leads - use a development database. Start a
// fresh mock for each run (it keeps its leads in memory), and make sure no
// other partner is connected to the mock (they would claim the same leads).
import crypto from 'node:crypto';

const API = `${process.env.E2E_API_URL || 'http://localhost:5000/api'}/channel-partner`;
const MOCK = 'http://127.0.0.1:5056';
const run = Date.now().toString(36);
let pass = 0, fail = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { token, body, headers = {}, raw, base = API, redirect } = {}) {
  const h = { 'X-Client-Platform': 'WEB', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) payload = raw;
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + path, { method, headers: h, body: payload, redirect: redirect || 'follow' });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* text */ }
  return { status: res.status, data, location: res.headers.get('location') };
}
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ->  ${JSON.stringify(detail)?.slice(0, 500)}`); }
}
const mockLog = async () => (await call('GET', '/log', { base: MOCK })).data;
const phone = () => `+9197${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

const owner = (await call('POST', '/partners/register', { body: { name: `LinkedIn ${run}`, mobile: phone(), email: `li.${run}@example.com`, username: `e2eli${run}`, password: 'Passw0rd!x' } })).data;
const T = owner.token;

console.log('\n== Connect (OAuth) ==');
let r = await call('GET', '/my/connectors/linkedin', { token: T });
check('LinkedIn is configured on the server, not yet connected', r.data.configured === true && r.data.connection === null, r.data);
r = await call('POST', '/my/connectors/linkedin/connect', { token: T });
check('connect returns the LinkedIn consent URL with state + scopes', r.status === 200 && r.data.url.includes('state=') && r.data.url.includes('r_marketing_leadgen_automation'), r);
const consent = await fetch(r.data.url, { redirect: 'manual' });
const back = await fetch(consent.headers.get('location'), { redirect: 'manual' });
check('callback exchanges the code and returns to the partner app (?connected=1)', back.status === 302 && back.headers.get('location').endsWith('/settings/connectors/linkedin?connected=1'), back.headers.get('location'));
r = await call('GET', '/connectors/linkedin/callback?state=forged&code=mock-code', { redirect: 'manual' });
check('a callback with an unknown state is refused', r.status === 302 && r.location.includes('error='), r.location);

r = await call('GET', '/my/connectors/linkedin', { token: T });
const conn = r.data.connection;
check('connected as the LinkedIn member, ad accounts listed', conn?.status === 'CONNECTED' && conn.memberName === 'Priya Nair' && conn.adAccounts.length === 2, conn);
check('tokens never leave the server', !JSON.stringify(r.data).includes('li-access') && !JSON.stringify(r.data).includes('li-refresh'), null);
check('auto-renews (refresh token) and shows when to reconnect', conn.autoRenews === true && !!conn.reconnectBy, conn);

r = await call('PATCH', '/my/connectors/linkedin', { token: T, body: { adAccounts: [{ accountUrn: 'urn:li:sponsoredAccount:5002', enabled: false }], defaultCountry: 'IN', syncMinutes: 5 } });
check('settings saved (one ad account switched off)', r.status === 200 && r.data.connection.adAccounts.find((a) => a.accountUrn.endsWith('5002')).enabled === false, r.data);
r = await call('PATCH', '/my/connectors/linkedin', { token: T, body: { syncMinutes: 2 } });
check('invalid sync interval refused', r.status === 400, r);

console.log('\n== Lead sync ==');
r = await call('POST', '/my/connectors/linkedin/sync', { token: T });
const c1 = r.data.result?.leads;
check('sync: 3 real leads (test lead excluded) - 2 created, 1 rejected (form has no phone); the catch-up pass skips them', c1?.CREATED === 2 && c1.REJECTED === 1 && c1.skipped === 3, r.data);
check('ad statistics fetched in the same run', r.data.result?.stats?.rows > 0, r.data.result);
let log = await mockLog();
check('every API call sent LinkedIn-Version + X-Restli-Protocol-Version', log.filter((x) => x.path.startsWith('/rest/')).every((x) => /^\d{6}$/.test(x.headers['linkedin-version']) && x.headers['x-restli-protocol-version'] === '2.0.0'), null);

const leads = (await call('GET', '/my/registrations', { token: T })).data.registrations;
const ananya = leads.find((l) => (l.customer?.name || l.contact?.name || '').startsWith('Ananya'));
check('LinkedIn leads are in My Leads', leads.length === 2 && !!ananya, leads.map((l) => l.customer?.name || l.contact?.name));
const detail = (await call('GET', `/my/registrations/${ananya.registrationId}`, { token: T })).data;
const flat = JSON.stringify(detail);
check('lead keeps source LinkedIn, form, campaign, company and custom answers', flat.includes('LinkedIn') && flat.includes('Lakeside Brochure Form') && flat.includes('Lakeside Launch - Lead Gen') && flat.includes('Infosys') && flat.includes('Budget: 1-2 Cr'), detail);
const rohit = leads.find((l) => (l.customer?.name || l.contact?.name || '').startsWith('Rohit'));
check('a national number gets the default country (+91)', JSON.stringify(rohit).includes('+9197'), rohit);

r = await call('POST', '/my/connectors/linkedin/sync', { token: T });
check('second sync: nothing imported twice', r.data.result?.leads?.CREATED === 0, r.data.result);

const dupPhone = detail.customer?.mobile || detail.contact?.mobile || ananya.customer?.mobile;
await call('POST', '/simulate/lead', { base: MOCK, body: { first: 'Ananya', last: 'R', phone: dupPhone, email: `again.${run}@example.com` } });
r = await call('POST', '/my/connectors/linkedin/sync', { token: T });
check('same customer again -> DUPLICATE (duplicate protection), no new lead', r.data.result?.leads?.DUPLICATE === 1 && r.data.result.leads.CREATED === 0, r.data.result);

console.log('\n== Missed leads: catch-up and date range ==');
const day = 86400000;
await call('POST', '/simulate/lead', { base: MOCK, body: { first: 'Late', last: 'Arrival', phone: phone(), submittedAt: Date.now() - 3 * day } });
await call('POST', '/simulate/lead', { base: MOCK, body: { first: 'Old', last: 'History', phone: phone(), submittedAt: Date.now() - 20 * day } });
r = await call('POST', '/my/connectors/linkedin/sync', { token: T });
let names = JSON.stringify((await call('GET', '/my/registrations', { token: T })).data.registrations);
check('a 3-day-old lead outside the regular window is picked up by the 7-day catch-up', names.includes('Late Arrival') && r.data.result.leads.CREATED === 1, r.data.result);
check('a 20-day-old lead is not (older than the catch-up)', !names.includes('Old History'), null);
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const range = { from: ymd(Date.now() - 25 * day), to: ymd(Date.now() - 15 * day) };
r = await call('POST', '/my/connectors/linkedin/fetch-range', { token: T, body: range });
names = JSON.stringify((await call('GET', '/my/registrations', { token: T })).data.registrations);
check('fetch by date range imports it', r.status === 200 && r.data.result.leads.CREATED === 1 && names.includes('Old History'), r.data);
r = await call('POST', '/my/connectors/linkedin/fetch-range', { token: T, body: range });
check('fetching the same range again creates nothing', r.data.result?.leads.CREATED === 0 && r.data.result.leads.skipped >= 1, r.data);
r = await call('POST', '/my/connectors/linkedin/fetch-range', { token: T, body: { from: ymd(Date.now()), to: ymd(Date.now() - 5 * day) } });
const tooLong = await call('POST', '/my/connectors/linkedin/fetch-range', { token: T, body: { from: '2026-01-01', to: '2026-10-01' } });
check('a reversed or longer-than-90-days range is refused', r.status === 400 && tooLong.status === 400, [r.data, tooLong.data]);

console.log('\n== Real-time webhook ==');
r = await call('GET', '/connectors/linkedin/webhook?challengeCode=abc-123');
const expected = crypto.createHmac('sha256', 'mock-secret').update('abc-123').digest('hex');
check('validation challenge answered with HMAC-SHA256(client secret)', r.data.challengeCode === 'abc-123' && r.data.challengeResponse === expected, r.data);
r = await call('POST', '/connectors/linkedin/webhook', { body: { leadGenFormResponse: 'urn:li:leadGenFormResponse:x', owner: { sponsoredAccount: 'urn:li:sponsoredAccount:5001' } } });
check('unsigned notification refused', r.status === 401, r);
r = await call('POST', '/simulate/lead', { base: MOCK, body: { first: 'Webhook', last: 'Person', phone: phone(), webhook: `${API}/connectors/linkedin/webhook` } });
check('signed notification accepted', r.data.webhookStatus === 200, r.data);
await sleep(1500);
const afterHook = (await call('GET', '/my/registrations', { token: T })).data.registrations;
check('notified lead is created within seconds (no waiting for the schedule)', afterHook.some((l) => JSON.stringify(l).includes('Webhook Person')), afterHook.length);

console.log('\n== Conversions API ==');
const statuses = (await call('GET', '/my/lead-statuses', { token: T })).data.statuses;
const target = statuses.find((s) => s.name === 'Qualified') || statuses.find((s) => !s.isDefault && !s.isBooking && !s.requiresSchedule);
r = await call('POST', '/my/connectors/linkedin/conversion-rules', { token: T, body: { stage: target.name, accountUrn: 'urn:li:sponsoredAccount:5001', conversionType: 'QUALIFIED_LEAD' } });
check(`conversion rule created on LinkedIn and mapped to "${target.name}"`, r.status === 201 && r.data.rule.conversionUrn.startsWith('urn:lla:llaPartnerConversion:'), r);
await call('PATCH', '/my/connectors/linkedin', { token: T, body: { capiEnabled: true } });
await call('POST', `/my/registrations/${ananya.registrationId}/progress`, { token: T, body: { stage: target.name } });
await sleep(1200);
log = await mockLog();
const events = log.filter((x) => x.path === '/rest/conversionEvents');
const ev = events.length ? JSON.parse(events[0].body) : null;
check('lead reaching the stage is sent to LinkedIn with the LinkedIn lead ID and hashed email', events.length === 1 && ev.user.lead.startsWith('urn:li:leadGenFormResponse:') && ev.user.userIds[0]?.idType === 'SHA256_EMAIL' && !events[0].body.includes('@'), ev);
const other = statuses.find((s) => s.name !== target.name && !s.isDefault && !s.isBooking && !s.requiresSchedule && !(s.fields || []).some((f) => f.isRequired));
await call('POST', `/my/registrations/${ananya.registrationId}/progress`, { token: T, body: { stage: other.name } });
await call('POST', `/my/registrations/${ananya.registrationId}/progress`, { token: T, body: { stage: target.name } });
await sleep(1200);
log = await mockLog();
check('re-entering the stage does not send it twice', log.filter((x) => x.path === '/rest/conversionEvents').length === 1, null);

console.log('\n== Token refresh ==');
await call('POST', '/simulate/expire', { base: MOCK });
r = await call('POST', '/my/connectors/linkedin/sync', { token: T });
r = await call('GET', '/my/connectors/linkedin', { token: T });
check('rejected access token is renewed with the refresh token, sync continues', r.data.connection.status === 'CONNECTED', r.data.connection);

console.log('\n== Stats + activity log ==');
r = await call('GET', '/my/connectors/linkedin/stats', { token: T });
const t = r.data.totals;
check('totals: spend, LinkedIn leads, created / duplicates / rejected, cost per lead', t.spend > 0 && t.linkedinLeads > 0 && t.created === 5 && t.duplicates === 1 && t.rejected === 1 && t.cpl > 0 && t.costPerCrmLead > 0, r.data.totals);
check('daily rows for 30 days + per-campaign breakdown in INR', r.data.daily.length === 30 && r.data.campaigns.some((c) => c.name === 'NRI Investors') && r.data.currency === 'INR', { days: r.data.daily.length, campaigns: r.data.campaigns.map((c) => c.name), currency: r.data.currency });
r = await call('GET', '/my/connectors/linkedin/activity?pageSize=100', { token: T });
const types = new Set(r.data.items.map((i) => i.type));
check('activity log: connect, settings, syncs, each lead outcome, webhook, conversion, token refresh', ['CONNECTED', 'SETTINGS_UPDATED', 'LEAD_SYNC', 'STATS_SYNC', 'LEAD_CREATED', 'LEAD_REJECTED', 'LEAD_DUPLICATE', 'WEBHOOK_RECEIVED', 'CONVERSION_RULE_CREATED', 'CONVERSION_SENT', 'TOKEN_REFRESHED'].every((x) => types.has(x)), [...types]);
r = await call('GET', '/my/connectors/linkedin/activity?level=ERROR', { token: T });
check('activity log filters by level', r.data.items.every((i) => i.level === 'ERROR') && r.data.items.some((i) => i.type === 'LEAD_REJECTED'), r.data.items.map((i) => i.type));

console.log('\n== Disconnect ==');
r = await call('DELETE', '/my/connectors/linkedin', { token: T });
r = await call('GET', '/my/connectors/linkedin', { token: T });
check('disconnected: tokens deleted, connection gone, history kept', r.data.connection === null && (await call('GET', '/my/connectors/linkedin/stats', { token: T })).data.totals.created === 5, r.data);

console.log('\n== App without the Advertising API product ==');
await call('GET', '/simulate/no-ads?on=true', { base: MOCK });
const second = (await call('POST', '/partners/register', { body: { name: `LinkedIn NoAds ${run}`, mobile: phone(), email: `li2.${run}@example.com`, username: `e2eli2${run}`, password: 'Passw0rd!x' } })).data;
r = await call('POST', '/my/connectors/linkedin/connect', { token: second.token });
const consent2 = await fetch(r.data.url, { redirect: 'manual' });
const back2 = await fetch(consent2.headers.get('location'), { redirect: 'manual' });
r = await call('GET', '/my/connectors/linkedin', { token: second.token });
check('connect still succeeds when LinkedIn refuses ad accounts (403)', back2.headers.get('location').endsWith('?connected=1') && r.data.connection?.status === 'CONNECTED' && r.data.connection.adAccounts.length === 0, r.data.connection);
check('...and the page explains which LinkedIn products are missing', /Advertising API/.test(r.data.connection?.lastError || ''), r.data.connection?.lastError);
await call('POST', '/my/connectors/linkedin/sync', { token: second.token });
r = await call('GET', '/my/connectors/linkedin', { token: second.token });
check('the warning stays after a sync', /Advertising API/.test(r.data.connection?.lastError || ''), r.data.connection?.lastError);
await call('GET', '/simulate/no-ads?on=false', { base: MOCK });
r = await call('POST', '/my/connectors/linkedin/accounts/refresh', { token: second.token });
check('once approved, "Refresh ad accounts" loads them and clears the warning', r.data.connection?.adAccounts.length === 2 && !r.data.connection.lastError, r.data.connection);
await call('DELETE', '/my/connectors/linkedin', { token: second.token });

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
