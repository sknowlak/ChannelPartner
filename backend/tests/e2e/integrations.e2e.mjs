// Run against a RUNNING backend with a seeded admin (npm run seed):
//   ADMIN_PW=<DEFAULT_ADMIN_PASSWORD> E2E_API_URL=http://localhost:5000/api node tests/e2e/integrations.e2e.mjs
// Creates synthetic partners/builders/leads (names prefixed e2e/P0/UI) in that database -
// use a development database, never production.
// Also needs: the mock CRM (node tests/e2e/mockCrm.mjs, port 5055) and the backend
// started with ALLOW_PRIVATE_WEBHOOK_TARGETS=true so it may call localhost.
// End-to-end: universal integrations (spec section 51) against the mock CRM.
import crypto from 'node:crypto';

const API = `${process.env.E2E_API_URL || 'http://localhost:5000/api'}/channel-partner`;
const MOCK = 'http://127.0.0.1:5055';
const run = Date.now().toString(36);
let pass = 0, fail = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { token, apiKey, body, headers = {}, raw, base = API } = {}) {
  const h = { 'X-Client-Platform': 'WEB', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (apiKey) h['X-Api-Key'] = apiKey;
  let payload;
  if (raw !== undefined) payload = raw;
  else if (body !== undefined) { h['Content-Type'] = h['Content-Type'] || 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + path, { method, headers: h, body: payload });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* text */ }
  return { status: res.status, data };
}
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ->  ${JSON.stringify(detail)?.slice(0, 400)}`); }
}
const mockLog = async () => (await call('GET', '/log', { base: MOCK })).data;
const phone = () => `+9197${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const lead = (token, extra = {}) => call('POST', '/my/registrations', {
  token, body: { customer: { name: 'Push Test', mobile: phone() }, propertySubType: 'Flat', notes: 'e2e', ...extra }
});

const owner = (await call('POST', '/partners/register', { body: { name: `Int ${run}`, mobile: phone(), email: `int.${run}@example.com`, username: `e2eint${run}`, password: 'Passw0rd!x' } })).data;
const T = owner.token;
const apiKey = (await call('POST', '/my/integrations/api-key/regenerate', { token: T })).data.apiKey; // shown once (section 52)

console.log('\n== Push: OAuth2 + create/update (two-way record link) ==');
let r = await call('POST', '/my/integrations/webhooks', {
  token: T,
  body: {
    name: 'OAuth CRM', targetUrl: `${MOCK}/crm/leads`, method: 'POST', format: 'CUSTOM',
    bodyTemplate: '{"name":"{{customer.name}}","ref":"{{registrationId}}","stage":"{{stage}}"}',
    events: ['LEAD_CREATED', 'STAGE_UPDATED', 'LEAD_UPDATED'],
    auth: { type: 'OAUTH2', tokenUrl: `${MOCK}/oauth/token`, clientId: 'cid', clientSecret: 'csecret' },
    mode: 'CREATE_UPDATE', responseIdPath: 'data.id', updateUrl: `${MOCK}/crm/leads/{{external.id}}`, updateMethod: 'PUT'
  }
});
check('create OAuth2 create/update webhook', r.status === 201, r);
const oauthHook = r.data;
check('client secret is never returned', oauthHook.auth?.clientSecret?.startsWith('••••') && !JSON.stringify(oauthHook).includes('csecret'), oauthHook.auth);

const l1 = await lead(T);
await sleep(1500);
let log = await mockLog();
const create = log.find((c) => c.path === '/crm/leads' && c.method === 'POST' && c.body.includes(l1.data.registrationId));
check('lead created -> POST with OAuth2 bearer token', create?.headers.authorization === 'Bearer tok-1', create);
check('OAuth2 token is cached (at most one token request)', log.filter((c) => c.path === '/oauth/token').length <= 1, log.filter((c) => c.path === '/oauth/token').length);

const statuses = (await call('GET', '/my/lead-statuses', { token: T })).data.statuses;
const nextStatus = statuses.find((s) => !s.isBooking && !s.requiresSchedule && s.name !== statuses.find((x) => x.isDefault)?.name && !(s.fields || []).some((f) => f.isRequired));
r = await call('POST', `/my/registrations/${l1.data.registrationId}/progress`, { token: T, body: { stage: nextStatus.name } });
await sleep(1500);
log = await mockLog();
const update = log.find((c) => c.method === 'PUT' && c.path === '/crm/leads/EXT-1');
check(`status change -> PUT to the SAME record (/crm/leads/EXT-1), not a new one`, !!update && update.body.includes(nextStatus.name), { status: r.status, puts: log.filter((c) => c.method === 'PUT').map((c) => c.path) });
check('no duplicate create on the other side', log.filter((c) => c.path === '/crm/leads' && c.body.includes(l1.data.registrationId)).length === 1, null);

r = await call('POST', `/my/integrations/webhooks/${oauthHook.webhookId}`.replace(/$/, '/test'), { token: T, body: {} });
check('Send test returns result + linked external ID', r.status === 200 && r.data.status === 'SUCCESS', r);

console.log('\n== Push: other auth types ==');
const hooks = [
  ['HMAC signing', { targetUrl: `${MOCK}/hmac`, auth: { type: 'HMAC', secret: 'hmac-secret-123', signatureHeader: 'X-Sig', signaturePrefix: 'sha256=' } }],
  ['API key in query string', { targetUrl: `${MOCK}/querykey`, auth: { type: 'API_KEY', keyName: 'key', keyValue: 'qsecret', keyIn: 'QUERY' } }],
  ['Basic auth', { targetUrl: `${MOCK}/basic`, auth: { type: 'BASIC', username: 'user', password: 'pass' } }]
];
const hookIds = {};
for (const [label, cfg] of hooks) {
  r = await call('POST', '/my/integrations/webhooks', { token: T, body: { name: label, method: 'POST', format: 'JSON', events: ['LEAD_CREATED'], ...cfg } });
  hookIds[label] = r.data.webhookId;
}
const flakyHook = (await call('POST', '/my/integrations/webhooks', { token: T, body: { name: 'Flaky', targetUrl: `${MOCK}/flaky`, events: ['LEAD_CREATED'] } })).data;
const l2 = await lead(T);
await sleep(2000);
const deliveries = (await call('GET', '/my/integrations/deliveries', { token: T })).data.deliveries.filter((d) => d.registrationId === l2.data.registrationId);
for (const [label] of hooks) {
  const d = deliveries.find((x) => x.webhookId === hookIds[label]);
  check(`${label} accepted by target`, d?.status === 'SUCCESS', d && { status: d.status, http: d.httpStatus, err: d.errorMessage });
}
const qd = deliveries.find((x) => x.webhookId === hookIds['API key in query string']);
check('query API key not stored in the delivery log', qd && !qd.requestUrl.includes('qsecret'), qd?.requestUrl);
const fd = deliveries.find((x) => x.webhookId === flakyHook.webhookId);
check('503 failure is scheduled for automatic retry', fd?.status === 'FAILED' && !!fd.nextRetryAt, fd && { status: fd.status, nextRetryAt: fd.nextRetryAt });
await call('PATCH', `/my/integrations/webhooks/${flakyHook.webhookId}`, { token: T, body: { isEnabled: false } });

console.log('\n== Receive: any JSON / form format ==');
r = await call('POST', '/my/integrations/sources', { token: T, body: { kind: 'RECEIVE', name: 'Facebook Leads' } });
check('create receive source', r.status === 201 && r.data.receiveUrl, r);
const src = r.data;
const hookPath = new URL(src.receiveUrl).pathname.replace('/api/channel-partner', '');
const fbPayload = (id, mobile, email) => ({ leads: [{ leadgen_id: id, field_data: { full_name: 'Facebook Person', phone_number: mobile, email }, campaign: 'Diwali Offer' }] });

const fbMobile = String(Math.floor(9700000000 + Math.random() * 99999999));
r = await call('POST', hookPath, { body: fbPayload(`FB-${run}`, fbMobile, `fb.${run}@example.com`) });
check('first payload before mapping is captured as a sample (202)', r.status === 202, r);
r = await call('POST', `/my/integrations/sources/${src.sourceId}/test`, { token: T, body: {} });
check('test lists the sender\'s field paths for mapping', r.status === 200 && r.data.paths.some((p) => p.path === 'leads.0.field_data.phone_number'), r.data?.paths);

r = await call('PATCH', `/my/integrations/sources/${src.sourceId}`, {
  token: T,
  body: {
    recordsPath: 'leads', externalIdPath: 'leadgen_id', defaultCountry: 'IN',
    mapping: [
      { fieldKey: 'name', path: 'field_data.full_name' },
      { fieldKey: 'mobile', path: 'field_data.phone_number' },
      { fieldKey: 'email', path: 'field_data.email' },
      { fieldKey: 'leadSource', source: 'FIXED', value: 'social media' },
      { fieldKey: 'campaignNames', path: 'campaign' }
    ]
  }
});
check('save mapping', r.status === 200, r);
r = await call('POST', hookPath, { body: fbPayload(`FB-${run}`, fbMobile, `fb.${run}@example.com`) });
check('their format + 10-digit number (default country IN) -> lead CREATED', r.data?.summary?.CREATED === 1, r);
const fbReg = r.data?.results?.[0]?.registrationId;
r = await call('POST', hookPath, { body: fbPayload(`FB-${run}`, fbMobile, `fb2.${run}@example.com`) });
check('same sender ID again -> UPDATED, not duplicated', r.data?.summary?.UPDATED === 1, r);
const fbLead = (await call('GET', `/my/registrations/${fbReg}`, { token: T })).data;
check('update applied (email changed; fixed dropdown value matched ignoring case)', fbLead.customer?.email === `fb2.${run}@example.com` && fbLead.registration?.leadSource === 'Social Media', { email: fbLead.customer?.email, src: fbLead.registration?.leadSource });

const formMobile = String(Math.floor(9600000000 + Math.random() * 99999999));
r = await call('POST', hookPath, {
  raw: `leads[0][leadgen_id]=FORM-${run}&leads[0][field_data][full_name]=Form+Person&leads[0][field_data][phone_number]=${formMobile}`,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});
check('form-encoded payload -> lead CREATED', r.data?.summary?.CREATED === 1, r);

await call('PATCH', `/my/integrations/sources/${src.sourceId}`, { token: T, body: { verifyAuth: { type: 'HMAC', secret: 'in-secret', signatureHeader: 'X-Hub-Signature-256', signaturePrefix: 'sha256=' }, verifyToken: 'fb-verify' } });
const signedBody = JSON.stringify(fbPayload(`SIG-${run}`, String(Math.floor(9500000000 + Math.random() * 99999999)), ''));
r = await call('POST', hookPath, { raw: signedBody, headers: { 'Content-Type': 'application/json' } });
check('unsigned request refused once HMAC verification is on', r.status === 401, r);
const sig = `sha256=${crypto.createHmac('sha256', 'in-secret').update(signedBody).digest('hex')}`;
r = await call('POST', hookPath, { raw: signedBody, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig } });
check('correctly signed request accepted', r.status === 200 && r.data.summary.CREATED === 1, r);
r = await call('GET', `${hookPath}?hub.mode=subscribe&hub.verify_token=fb-verify&hub.challenge=12345`);
check('Facebook-style verify handshake echoes the challenge', r.status === 200 && String(r.data) === '12345', r);
r = await call('POST', '/hooks/src_' + '0'.repeat(40), { body: { a: 1 } });
check('unknown receive URL -> 404', r.status === 404, r);

console.log('\n== Pull: scheduled fetch from any API ==');
r = await call('POST', '/my/integrations/sources', {
  token: T,
  body: {
    kind: 'PULL', name: 'Partner Portal API', url: `${MOCK}/api/leads?page={{page}}&per_page={{limit}}&since={{since}}&seed=${run}`,
    auth: { type: 'API_KEY', keyName: 'key', keyValue: 'pullkey', keyIn: 'QUERY' },
    pagination: { type: 'PAGE', pageSize: 2, startPage: 1, maxPages: 5 },
    recordsPath: 'items', externalIdPath: 'id', defaultCountry: 'IN', intervalMinutes: 60,
    mapping: [{ fieldKey: 'name', path: 'person.full_name' }, { fieldKey: 'mobile', path: 'person.phone' }, { fieldKey: 'stage', path: 'status' }],
    statusMap: [{ from: 'new', to: statuses.find((s) => s.isDefault).name }, { from: 'qualified', to: nextStatus.name }]
  }
});
check('create pull source', r.status === 201, r);
const pull = r.data;
r = await call('POST', `/my/integrations/sources/${pull.sourceId}/test`, { token: T, body: {} });
check('test fetch shows sample + mapped preview, imports nothing', r.status === 200 && r.data.records === 2 && r.data.preview[0].mapped.customer.name === 'Pull One', r);
r = await call('POST', `/my/integrations/sources/${pull.sourceId}/run`, { token: T, body: {} });
check('run: 2 pages walked, 3 leads created', r.data.pages === 2 && r.data.CREATED === 3 && !r.data.error, r.data);
r = await call('POST', `/my/integrations/sources/${pull.sourceId}/run`, { token: T, body: {} });
check('second run: same records update, no duplicates', r.data.CREATED === 0 && r.data.DUPLICATE === 0 && (r.data.UPDATED + r.data.UNCHANGED) === 3, r.data);
log = await mockLog();
const secondPull = log.filter((c) => c.path === '/api/leads').pop();
check('{{since}} carries the last successful run time', !!secondPull?.query.since, secondPull?.query);
const events = (await call('GET', `/my/integrations/inbound-events?sourceId=${pull.sourceId}`, { token: T })).data.events;
check('inbound log records each record outcome', events.length >= 6, events.length);
const myLeads = (await call('GET', '/my/registrations', { token: T })).data.registrations;
const p2 = myLeads.find((x) => x.customerName === 'Pull Two');
check('status map applied ("qualified" -> our status)', p2?.currentStage === nextStatus.name, p2?.currentStage);

console.log('\n== Open API: others read + subscribe ==');
r = await call('GET', '/integrations/leads?limit=2', { apiKey });
check('list leads with X-Api-Key (paged)', r.status === 200 && r.data.leads.length === 2 && r.data.hasMore, r.data && { total: r.data.total, n: r.data.leads?.length });
r = await call('GET', '/integrations/leads?limit=1', { headers: { Authorization: `Bearer ${apiKey}` } });
check('Authorization: Bearer <key> works', r.status === 200, r.status);
r = await call('GET', `/integrations/leads?limit=1&api_key=${apiKey}`);
check('?api_key= works for header-less tools', r.status === 200, r.status);
r = await call('GET', `/integrations/leads/${l1.data.registrationId}`, { apiKey });
check('get one lead', r.status === 200 && r.data.customer?.name === 'Push Test', r);
r = await call('PATCH', `/integrations/leads/${l1.data.registrationId}`, { apiKey, body: { notes: 'updated via API' } });
check('update lead fields via API', r.status === 200, r);
r = await call('GET', '/integrations/lead-fields', { apiKey });
check('lead fields list with body paths', r.data.fields?.some((f) => f.bodyPath === 'customer.mobile'), r.status);
r = await call('GET', '/integrations/lead-statuses', { apiKey });
check('status pipeline readable', r.data.statuses?.length > 0, r.status);
r = await call('POST', '/integrations/subscriptions', { apiKey, body: { targetUrl: `${MOCK}/hooks-in`, events: ['LEAD_CREATED'] } });
check('subscribe a callback URL (REST hook)', r.status === 201, r);
const subId = r.data.webhookId;
const l3 = await lead(T);
await sleep(1500);
log = await mockLog();
check('subscriber receives new lead events', log.some((c) => c.path === '/hooks-in' && c.body.includes(l3.data.registrationId)), null);
r = await call('DELETE', `/integrations/subscriptions/${subId}`, { apiKey });
check('unsubscribe', r.status === 200, r);
r = await call('GET', '/integrations/openapi.json');
check('OpenAPI document is public', r.status === 200 && r.data.openapi === '3.0.3', r.status);
r = await call('GET', '/integrations/leads', { apiKey: 'lr_wrong' });
check('wrong key refused', r.status === 401, r.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
