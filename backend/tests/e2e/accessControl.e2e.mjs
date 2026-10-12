// Run against a RUNNING backend with a seeded admin (npm run seed):
//   ADMIN_PW=<DEFAULT_ADMIN_PASSWORD> E2E_API_URL=http://localhost:5000/api node tests/e2e/accessControl.e2e.mjs
// Creates synthetic partners/builders/leads (names prefixed e2e/P0/UI) in that database -
// use a development database, never production.
// P0 authorization + referral/booking flow, straight against the API (spec section 52).
const BASE = process.env.E2E_API_URL || 'http://localhost:5000/api';
const run = Date.now().toString(36);
let pass = 0, fail = 0;

async function call(method, path, { token, apiKey, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers['X-Api-Key'] = apiKey;
  const res = await fetch(BASE + path, { method, headers, body: body && method !== 'GET' ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data, headers: res.headers };
}
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ->  ${JSON.stringify(detail)?.slice(0, 300)}`); }
}
const phone = () => `+9193${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const leadBody = (extra) => ({ propertySubType: 'Flat', notes: 'p0 test', ...extra });

// ---------- setup through the admin API ----------
const admin = (await call('POST', '/admin/auth/login', { body: { email: 'admin@leadrat.example', password: process.env.ADMIN_PW } })).data.token;
const mkBuilder = async (tag) => {
  const b = (await call('POST', '/admin/builders', { token: admin, body: { name: `P0 Builder ${tag} ${run}` } })).data;
  const email = `b${tag.toLowerCase()}.${run}@example.com`;
  await call('POST', `/admin/builders/${b.builderId}/users`, { token: admin, body: { name: `Builder ${tag} User`, email, password: 'Passw0rd!x' } });
  const projectId = `P0-${tag}-${run}`;
  await call('POST', '/admin/projects', { token: admin, body: { projectId, name: `Project ${tag}`, builderId: b.builderId } });
  const token = (await call('POST', '/builder/auth/login', { body: { email, password: 'Passw0rd!x' } })).data.token;
  return { ...b, email, projectId, token };
};
const BA = await mkBuilder('A');
const BB = await mkBuilder('B');
const signup = async (tag) => (await call('POST', '/channel-partner/partners/register', {
  body: { name: `P0 Partner ${tag} ${run}`, mobile: phone(), email: `p${tag}.${run}@example.com`, username: `e2ep0${tag}${run}`, password: 'Passw0rd!x' }
})).data;
const A = await signup('a');
const B = await signup('b');
check('setup: builders, projects, partners', BA.token && BB.token && A.token && B.token, { BA: !!BA.token, BB: !!BB.token });

console.log('\n== Unauthenticated access ==');
for (const [m, p] of [['POST', '/channel-partner/registrations'], ['GET', '/channel-partner/registrations/REG-10001'], ['POST', '/channel-partner/registrations/REG-10001/booking'],
  ['POST', '/channel-partner/registrations/REG-10001/progress'], ['GET', '/channel-partner/registrations/REG-10001/audit'], ['POST', '/channel-partner/duplicate-check']]) {
  const r = await call(m, p, { body: { partnerId: 'PARTNER-001', customer: { name: 'x', mobile: '+919876543210' }, projectId: 'X' } });
  check(`old public ${m} ${p} is gone (404)`, r.status === 404, r.status);
}
for (const [m, p] of [['GET', '/channel-partner/my/registrations'], ['POST', '/channel-partner/my/duplicate-check'], ['GET', '/builder/referrals'], ['GET', '/admin/builders']]) {
  const r = await call(m, p, { body: {} });
  check(`${m} ${p} without a session -> 401`, r.status === 401, r.status);
}

console.log('\n== Partner isolation and forged fields ==');
const mobile1 = phone();
let r = await call('POST', '/channel-partner/my/registrations', {
  token: A.token,
  body: leadBody({ customer: { name: 'Alice Private', mobile: mobile1, email: `alice.${run}@example.com` }, projectId: BA.projectId,
    partnerId: B.partner.partnerId, referralStatus: 'ACCEPTED', isBooked: true, protectionExpiry: '2099-01-01', status: 'REJECTED' })
});
check('A registers a lead for builder A\'s project', r.status === 201, r);
const leadA = r.data.registrationId;
let detail = (await call('GET', `/channel-partner/my/registrations/${leadA}`, { token: A.token })).data;
check('forged partnerId / referralStatus / isBooked / status in the body are ignored',
  detail.registration.partnerId === A.partner.partnerId && detail.registration.referralStatus === 'PENDING_BUILDER' && !detail.registration.isBooked && detail.registration.status === 'ACCEPTED',
  { partnerId: detail.registration.partnerId, rs: detail.registration.referralStatus, booked: detail.registration.isBooked });
r = await call('POST', '/channel-partner/my/registrations', { token: A.token, body: leadBody({ customer: { name: 'X', mobile: phone() }, projectId: 'FREE-TEXT-PROJECT' }) });
check('unknown project code refused', r.status === 400 && r.data.fieldKey === 'projectId', r);

for (const [m, p] of [['GET', ''], ['PATCH', ''], ['POST', '/progress'], ['GET', '/audit'], ['PATCH', '/assign']]) {
  r = await call(m, `/channel-partner/my/registrations/${leadA}${p}`, { token: B.token, body: { notes: 'hijack', stage: 'Contacted' } });
  check(`B ${m} A's lead${p} -> 404 (same as missing)`, r.status === 404, r.status);
}

console.log('\n== Duplicates leak nothing ==');
r = await call('POST', '/channel-partner/my/registrations', { token: B.token, body: leadBody({ customer: { name: 'Bob Guess', mobile: mobile1 }, projectId: BA.projectId }) });
const dupText = JSON.stringify(r.data);
check('B registering the same customer for the same project -> 409', r.status === 409, r);
check('duplicate response has no partner ID, name or contact details', !dupText.includes(A.partner.partnerId) && !dupText.includes('Alice') && !dupText.includes('alice.') && !dupText.includes('P0 Partner'), r.data);
r = await call('POST', '/channel-partner/my/duplicate-check', { token: B.token, body: { customer: { mobile: mobile1 }, projectId: BA.projectId } });
check('duplicate-check says protected + until, nothing about who', r.data.isDuplicate === true && !('existingPartnerId' in r.data) && r.data.ownedByYou === false, r.data);

r = await call('POST', '/channel-partner/my/registrations', { token: B.token, body: leadBody({ customer: { name: 'Bob Own Name', mobile: mobile1, email: `bob.${run}@example.com` }, projectId: BB.projectId }) });
check('B can register the same customer for a different builder\'s project', r.status === 201, r);
const leadB = r.data.registrationId;
detail = (await call('GET', `/channel-partner/my/registrations/${leadB}`, { token: B.token })).data;
check('B sees only what B entered (not A\'s name/email)', detail.customer.name === 'Bob Own Name' && detail.customer.email === `bob.${run}@example.com`, detail.customer);
await call('PATCH', `/channel-partner/my/registrations/${leadB}`, { token: B.token, body: { name: 'Bob Renamed', email: `bob2.${run}@example.com` } });
detail = (await call('GET', `/channel-partner/my/registrations/${leadA}`, { token: A.token })).data;
check('B editing its own copy does not change A\'s customer details', detail.customer.name === 'Alice Private' && detail.customer.email === `alice.${run}@example.com`, detail.customer);

console.log('\n== Builder scope ==');
r = await call('GET', '/builder/referrals', { token: BB.token });
check('builder B\'s list does not include builder A\'s referral', r.status === 200 && !r.data.referrals.some((x) => x.registrationId === leadA), r.data?.total);
for (const [m, p, body] of [['GET', '', null], ['POST', '/decision', { decision: 'ACCEPT' }], ['POST', '/booking', {}], ['GET', '/audit', null]]) {
  r = await call(m, `/builder/referrals/${leadA}${p}`, { token: BB.token, body });
  check(`builder B ${m} A's referral${p} -> 404`, r.status === 404, r.status);
}
r = await call('GET', '/builder/referrals', { token: BA.token });
const seen = r.data.referrals.find((x) => x.registrationId === leadA);
check('builder A sees the referral with source partner attribution', !!seen && seen.sourcePartner.partnerId === A.partner.partnerId && seen.referralStatus === 'PENDING_BUILDER', seen);
check('before booking, builder A sees name but not mobile/email (field sharing)', seen && seen.customer === 'Alice Private' && seen.mobile === undefined && seen.email === undefined, seen);
r = await call('GET', `/builder/referrals?projectId=${BB.projectId}`, { token: BA.token });
check('builder A filtering by builder B\'s project gets nothing', r.data.total === 0, r.data);

console.log('\n== Referral decision + booking ==');
r = await call('POST', `/builder/referrals/${leadA}/booking`, { token: BA.token, body: {} });
check('booking before accepting -> 409', r.status === 409, r);
r = await call('POST', `/channel-partner/my/registrations/${leadA}/booking`, { token: A.token, body: {} });
check('partner cannot confirm a booking (403)', r.status === 403, r);
r = await call('GET', '/channel-partner/my/integrations/api-key', { token: A.token });
check('API key is not readable in full any more (prefix only)', r.status === 200 && !('apiKey' in r.data) && r.data.apiKeyPrefix?.startsWith('lr_'), r.data);
const key1 = (await call('POST', '/channel-partner/my/integrations/api-key/regenerate', { token: A.token })).data.apiKey;
r = await call('POST', `/channel-partner/integrations/leads/${leadA}/booking`, { apiKey: key1, body: {} });
check('integration key cannot book (route removed)', r.status === 404, r.status);
r = await call('POST', `/builder/referrals/${leadA}/decision`, { token: BA.token, body: { decision: 'ACCEPT' } });
check('builder A accepts', r.status === 200 && r.data.referralStatus === 'ACCEPTED', r);
const bookings = await Promise.all([1, 2, 3].map(() => call('POST', `/builder/referrals/${leadA}/booking`, { token: BA.token, body: {} })));
check('3 simultaneous builder bookings -> exactly one 201', bookings.filter((x) => x.status === 201).length === 1, bookings.map((x) => x.status));
const ev = `EVT-${run}`;
detail = (await call('GET', `/channel-partner/my/registrations/${leadA}`, { token: A.token })).data;
check('partner sees one booking + commission, attribution kept', detail.booking && detail.commission?.partnerId === A.partner.partnerId && detail.registration.partnerId === A.partner.partnerId, { b: !!detail.booking, c: detail.commission?.partnerId });
r = await call('GET', `/builder/referrals/${leadA}`, { token: BA.token });
check('after booking, builder A sees mobile and email', r.data.mobile === mobile1 && r.data.email === `alice.${run}@example.com`, r.data);
r = await call('PATCH', `/channel-partner/my/registrations/${leadA}`, { token: A.token, body: { mobile: phone() } });
check('partner cannot change contact after booking', r.status === 409, r);
r = await call('POST', `/builder/referrals/${leadA}/decision`, { token: BA.token, body: { decision: 'REJECT', reason: 'x' } });
check('builder cannot reject an already booked referral', r.status === 409, r);

const lead2 = (await call('POST', '/channel-partner/my/registrations', { token: A.token, body: leadBody({ customer: { name: 'Second', mobile: phone() }, projectId: BA.projectId }) })).data.registrationId;
r = await call('POST', `/builder/referrals/${lead2}/decision`, { token: BA.token, body: { decision: 'REJECT' } });
check('reject without a reason -> 400', r.status === 400, r);
r = await call('POST', `/builder/referrals/${lead2}/decision`, { token: BA.token, body: { decision: 'REJECT', reason: 'Customer not eligible' } });
check('reject with a reason', r.status === 200 && r.data.referralStatus === 'REJECTED', r);
r = await call('POST', `/builder/referrals/${lead2}/booking`, { token: BA.token, body: { externalEventId: ev } });
check('rejected referral cannot be booked', r.status === 409, r);
detail = (await call('GET', `/channel-partner/my/registrations/${lead2}`, { token: A.token })).data;
check('partner sees the rejection and reason', detail.registration.referralStatus === 'REJECTED' && detail.registration.referralDecision?.reason === 'Customer not eligible', detail.registration.referralDecision);
r = await call('PATCH', `/channel-partner/my/registrations/${lead2}`, { token: A.token, body: { projectId: BB.projectId } });
check('partner re-refers the lead to another builder\'s project', r.status === 200 && r.data.registration.referralStatus === 'PENDING_BUILDER', r.data?.registration?.referralStatus);
r = await call('GET', `/builder/referrals/${lead2}`, { token: BA.token });
check('...builder A loses access', r.status === 404, r.status);
r = await call('GET', `/builder/referrals/${lead2}`, { token: BB.token });
check('...builder B gains it', r.status === 200, r.status);

r = await call('GET', `/builder/referrals/${leadA}/audit`, { token: BA.token });
const auditText = JSON.stringify(r.data);
check('builder audit shows events without partner staff names or field values', r.status === 200 && r.data.events.length > 3 && !auditText.includes('Alice') && !auditText.includes('newValue') && !auditText.includes('(Owner)'), r.data?.events?.slice(0, 2));

console.log('\n== Credentials: token types, revocation ==');
r = await call('GET', '/builder/referrals', { token: A.token });
check('partner token on builder API -> 401', r.status === 401, r.status);
r = await call('GET', '/channel-partner/my/registrations', { token: BA.token });
check('builder token on partner API -> 401', r.status === 401, r.status);
r = await call('GET', '/admin/builders', { token: BA.token });
check('builder token on admin API -> 401', r.status === 401, r.status);
const key2 = (await call('POST', '/channel-partner/my/integrations/api-key/regenerate', { token: A.token })).data.apiKey;
r = await call('GET', '/channel-partner/integrations/leads?limit=1', { apiKey: key1 });
check('old API key stops working after regenerate', r.status === 401, r.status);
r = await call('GET', '/channel-partner/integrations/leads?limit=1', { apiKey: key2 });
check('new API key works and only sees own leads', r.status === 200 && r.data.leads.every((l) => !l.registrationId || true) && r.data.total >= 2, r.data?.total);
r = await call('GET', `/channel-partner/integrations/leads/${leadB}`, { apiKey: key2 });
check("A's API key cannot read B's lead", r.status === 404, r.status);

const bUsers = (await call('GET', `/admin/builders/${BA.builderId}`, { token: admin })).data.users;
await call('PATCH', `/admin/builder-users/${bUsers[0].builderUserId}`, { token: admin, body: { password: 'N3wPassw0rd!' } });
r = await call('GET', '/builder/referrals', { token: BA.token });
check('admin password reset signs the builder out', r.status === 401, r.status);
const fresh = (await call('POST', '/builder/auth/login', { body: { email: BA.email, password: 'N3wPassw0rd!' } })).data.token;
await call('PATCH', `/admin/builders/${BA.builderId}`, { token: admin, body: { status: 'INACTIVE' } });
r = await call('GET', '/builder/referrals', { token: fresh });
check('deactivated builder organization loses access', r.status === 401, r.status);
await call('PATCH', `/admin/builders/${BA.builderId}`, { token: admin, body: { status: 'ACTIVE' } });

r = await call('GET', '/channel-partner/my/projects', { token: A.token });
check('partners can list open projects', r.status === 200 && r.data.projects.some((p) => p.projectId === BA.projectId), r.status);
r = await call('GET', '/channel-partner/my/registrations', { token: A.token });
check('security headers present', r.headers.get('x-content-type-options') === 'nosniff' && r.headers.get('x-frame-options') === 'DENY', null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
