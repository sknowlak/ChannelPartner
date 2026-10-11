// Run against a RUNNING backend with a seeded admin (npm run seed):
//   ADMIN_PW=<DEFAULT_ADMIN_PASSWORD> E2E_API_URL=http://localhost:5000/api node tests/e2e/securityRegression.e2e.mjs
// Creates synthetic partners/builders/leads (names prefixed e2e/P0/UI) in that database -
// use a development database, never production.
// End-to-end check of the loophole fixes against the running backend.
const API = process.env.E2E_API_URL || 'http://localhost:5000/api';
const run = Date.now().toString(36);
let pass = 0, fail = 0;

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'WEB', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ->  ${JSON.stringify(detail)}`); }
}
// New partners' default lead form requires Property Sub-Type and Notes.
const reg = ({ token, body }) => call('POST', '/channel-partner/my/registrations', { token, body: { propertySubType: 'Flat', notes: 'e2e test lead', ...body } });
const mobile = () => `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

async function signup(tag) {
  const r = await call('POST', '/channel-partner/partners/register', {
    body: { name: `E2E ${tag} ${run}`, mobile: mobile(), email: `e2e.${tag}.${run}@example.com`, username: `e2e${tag}${run}`, password: 'Passw0rd!x' }
  });
  return r.data;
}

console.log('\n== Accounts, roles, sessions ==');
const A = await signup('a');
check('owner signup', !!A?.token, A);
let tokenA = A.token;

const badLogins = [];
for (let i = 0; i < 9; i++) badLogins.push(await call('POST', '/channel-partner/partners/login', { body: { username: `e2ea${run}`, password: 'wrong' } }));
check('wrong password -> 401', badLogins[0].status === 401, badLogins[0]);
check('9th failed login is rate-limited (429)', badLogins[8].status === 429, badLogins[8]);

const roles = (await call('GET', '/channel-partner/my/roles', { token: tokenA })).data.roles;
const adminRole = roles.find((r) => r.name === 'Admin');
const superRole = roles.find((r) => r.name === 'Super Admin');
const weak = await call('POST', '/channel-partner/my/team', { token: tokenA, body: { name: 'Weak', username: `e2ew${run}`, password: 'short', roleId: adminRole.roleId } });
check('member with 5-char password refused', weak.status === 400, weak);
const mem = await call('POST', '/channel-partner/my/team', { token: tokenA, body: { name: 'E2E Admin Member', username: `e2em${run}`, password: 'Passw0rd!x', roleId: adminRole.roleId } });
check('owner adds Admin-role member', mem.status === 201, mem);
const M = (await call('POST', '/channel-partner/partners/login', { body: { username: `e2em${run}`, password: 'Passw0rd!x' } })).data;

let r = await call('PATCH', `/channel-partner/my/team/${mem.data.memberId}`, { token: M.token, body: { roleId: superRole.roleId } });
check('Admin member cannot promote self to Super Admin', r.status === 403, r);
r = await call('PATCH', `/channel-partner/my/team/${mem.data.memberId}`, { token: M.token, body: { status: 'INACTIVE' } });
check('member cannot change own status', r.status === 403, r);
const other = await call('POST', '/channel-partner/my/team', { token: M.token, body: { name: 'Other', username: `e2eo${run}`, password: 'Passw0rd!x', roleId: superRole.roleId } });
check('Admin member cannot create a Super Admin member', other.status === 403, other);

r = await call('GET', '/channel-partner/my/integrations/api-key', { token: M.token });
check('member without MANAGE_SETTINGS cannot read API key', r.status === 403, r);
r = await call('GET', '/channel-partner/my/integrations/api-key', { token: tokenA });
check('owner sees only the key prefix (full key shown once at generation)', r.status === 200 && !r.data.apiKey && r.data.apiKeyPrefix, r.data);
check('login response no longer carries apiKey', A.partner && A.partner.apiKey === undefined, Object.keys(A.partner || {}));

r = await call('PATCH', '/channel-partner/my/profile', { token: tokenA, body: { password: 'NewPassw0rd!' } });
check('password change without current password refused', r.status === 400, r);
await new Promise((res) => setTimeout(res, 1100)); // tokens are second-granular
r = await call('PATCH', '/channel-partner/my/profile', { token: tokenA, body: { password: 'NewPassw0rd!', currentPassword: 'Passw0rd!x' } });
check('password change with current password works + returns new token', r.status === 200 && r.data.token, r);
const oldToken = tokenA;
tokenA = r.data.token;
r = await call('GET', '/channel-partner/my/profile', { token: oldToken });
check('old token rejected after password change', r.status === 401, r);
r = await call('GET', '/channel-partner/my/profile', { token: tokenA });
check('new token works', r.status === 200, r);

console.log('\n== Webhooks / SSRF / secrets ==');
for (const url of ['http://169.254.169.254/latest/meta-data/', 'http://localhost:27017', 'http://10.0.0.5/admin', 'file:///etc/passwd']) {
  r = await call('POST', '/channel-partner/my/integrations/webhooks', { token: tokenA, body: { name: 'bad', targetUrl: url } });
  check(`webhook to ${url} refused`, r.status === 400, r);
}
r = await call('POST', '/channel-partner/my/integrations/webhooks', { token: tokenA, body: { name: 'inject', targetUrl: 'https://example.com/hook', headers: { 'X-A': 'v\r\nX-Evil: 1' } } });
check('header injection refused', r.status === 400, r);
r = await call('POST', '/channel-partner/my/integrations/webhooks', { token: tokenA, body: { name: 'ok', targetUrl: 'https://example.com/hook', headers: { Authorization: 'Bearer supersecrettoken1234' }, events: ['BOOKING_COMPLETED'] } });
check('public webhook accepted', r.status === 201, r);
r = await call('GET', '/channel-partner/my/integrations/webhooks', { token: M.token });
const seen = r.data.webhooks.find((w) => w.name === 'ok');
check('member sees Authorization header masked', seen?.headers?.Authorization === '••••1234', seen?.headers);
r = await call('GET', '/channel-partner/my/integrations/webhooks', { token: tokenA });
check('owner (MANAGE_SETTINGS) sees full header', r.data.webhooks.find((w) => w.name === 'ok')?.headers?.Authorization === 'Bearer supersecrettoken1234');
r = await call('POST', '/channel-partner/my/notification-rules', { token: tokenA, body: { name: 'ssrf', channels: { webhook: true }, webhook: { url: 'http://127.0.0.1:5000/health' } } });
check('notification rule webhook to localhost refused', r.status === 400, r);

console.log('\n== Duplicate protection ==');
// Projects must exist in the catalogue now (section 52) - create a builder with two.
const admTok = (await call('POST', '/admin/auth/login', { body: { email: 'admin@leadrat.example', password: process.env.ADMIN_PW } })).data.token;
const bld = (await call('POST', '/admin/builders', { token: admTok, body: { name: `Sec Builder ${run}` } })).data;
const P1 = `SEC1-${run}`;
const P2 = `SEC2-${run}`;
await call('POST', '/admin/projects', { token: admTok, body: { projectId: P1, name: 'Sec One', builderId: bld.builderId } });
await call('POST', '/admin/projects', { token: admTok, body: { projectId: P2, name: 'Sec Two', builderId: bld.builderId } });
await call('POST', `/admin/builders/${bld.builderId}/users`, { token: admTok, body: { name: 'Sec Builder', email: `sec.${run}@example.com`, password: 'Passw0rd!x' } });
const bTok = (await call('POST', '/builder/auth/login', { body: { email: `sec.${run}@example.com`, password: 'Passw0rd!x' } })).data.token;

const B = await signup('b');
const custMobile = mobile();
const email = `victim.${run}@gmail.com`;
const regA = await reg({ token: tokenA, body: { customer: { name: 'Victim', mobile: custMobile, email }, projectId: P1 } });
check('A registers customer for P1', regA.status === 201, regA);
r = await reg({ token: B.token, body: { customer: { name: 'Victim', mobile: custMobile }, projectId: P1 } });
check('B same mobile same project -> rejected', r.status === 409, r);
r = await reg({ token: B.token, body: { customer: { name: 'Victim', mobile: mobile(), email: `  Vic.Tim.${run}+x@GMAIL.com ` }, projectId: P1 } });
check('B email variant (case/space/+tag/dots) -> rejected', r.status === 409, r);
const altMobile = mobile();
r = await reg({ token: tokenA, body: { customer: { name: 'Alt', mobile: mobile(), alternateMobile: altMobile }, projectId: P1 } });
r = await reg({ token: B.token, body: { customer: { name: 'Alt', mobile: altMobile }, projectId: P1 } });
check("B using customer's alternate number -> rejected", r.status === 409, r);

r = await call('POST', '/channel-partner/my/duplicate-check', { token: B.token, body: { customer: { mobile: mobile(), email: { $regex: '^v' } }, projectId: { $ne: null } } });
check('NoSQL operator in /my/duplicate-check does not match anything', r.status === 400 || r.data?.isDuplicate === false, r);

const raceMobile = mobile();
const race = await Promise.all([tokenA, B.token, tokenA, B.token].map((t) =>
  reg({ token: t, body: { customer: { name: 'Race', mobile: raceMobile }, projectId: P1 } })));
check('4 simultaneous registrations -> exactly one accepted', race.filter((x) => x.status === 201).length === 1, race.map((x) => x.status));

console.log('\n== Edits cannot steal customers ==');
const regB2 = await reg({ token: B.token, body: { customer: { name: 'Victim', mobile: custMobile }, projectId: P2 } });
check('B registers same customer for a different project (allowed)', regB2.status === 201, regB2);
r = await call('PATCH', `/channel-partner/my/registrations/${regB2.data.registrationId}`, { token: B.token, body: { projectId: P1 } });
check("B can't move lead into A's protected project", r.status === 409, r);
r = await call('PATCH', `/channel-partner/my/registrations/${regB2.data.registrationId}`, { token: B.token, body: { mobile: mobile() } });
check('B changing the number on its OWN lead is allowed (own copy)', r.status === 200, r);
const aView = (await call('GET', `/channel-partner/my/registrations/${regA.data.registrationId}`, { token: tokenA })).data;
check("...and A's lead still has A's number", aView.customer.mobile === custMobile, aView.customer);
r = await reg({ token: B.token, body: { customer: { name: 'Victim', mobile: custMobile }, projectId: P1 } });
check("A's original number is still protected for P1", r.status === 409, r);
r = await call('PATCH', `/channel-partner/my/registrations/${regA.data.registrationId}`, { token: tokenA, body: { requirementType: 'Steal' } });
check('SELECT value not in options refused', r.status === 400, r);
r = await call('PATCH', `/channel-partner/my/registrations/${regA.data.registrationId}`, { token: tokenA, body: { budgetMax: 'lots' } });
check('non-number in CURRENCY field refused', r.status === 400, r);

console.log('\n== Booking (builder only) ==');
r = await call('POST', `/channel-partner/my/registrations/${regA.data.registrationId}/booking`, { token: tokenA, body: {} });
check('partner cannot book', r.status === 403, r);
await call('POST', `/builder/referrals/${regA.data.registrationId}/decision`, { token: bTok, body: { decision: 'ACCEPT' } });
r = await call('POST', `/builder/referrals/${regA.data.registrationId}/booking`, { token: bTok, body: {} });
check('builder books accepted referral', r.status === 201, r);
r = await call('POST', `/builder/referrals/${regA.data.registrationId}/booking`, { token: bTok, body: {} });
check('second booking of same lead refused', r.status === 409, r);
r = await call('POST', `/channel-partner/my/registrations/${regA.data.registrationId}/progress`, { token: tokenA, body: { stage: 'Contacted' } });
check('status change on booked lead refused', r.status === 409, r);
const lead3 = await reg({ token: tokenA, body: { customer: { name: 'Idem', mobile: mobile() }, projectId: P2 } });
await call('POST', `/builder/referrals/${lead3.data.registrationId}/decision`, { token: bTok, body: { decision: 'ACCEPT' } });
const ev = `EVT-${run}`;
const idem = await Promise.all([1, 2].map(() => call('POST', `/builder/referrals/${lead3.data.registrationId}/booking`, { token: bTok, body: { externalEventId: ev } })));
check('same event ID twice at once -> one booking (other replays or 409)', idem.filter((x) => x.status === 201).length === 1, idem.map((x) => x.status));
const lead4 = await reg({ token: tokenA, body: { customer: { name: 'Pub', mobile: mobile() }, projectId: P2 } });
const statuses = (await call('GET', '/channel-partner/my/lead-statuses', { token: tokenA })).data.statuses;
const bookingStatus = statuses.find((s) => s.isBooking)?.name;
r = await call('POST', `/channel-partner/my/registrations/${lead4.data.registrationId}/progress`, { token: tokenA, body: { stage: bookingStatus } });
check(`partner cannot set booking status "${bookingStatus}" as a plain stage`, r.status === 400, r);

console.log('\n== Admin ==');
const adm = await call('POST', '/admin/auth/login', { body: { email: 'admin@leadrat.example', password: process.env.ADMIN_PW } });
if (adm.status === 200) {
  r = await call('PUT', '/admin/settings', { token: adm.data.token, body: { duplicateMatchFields: [] } });
  check('admin cannot switch duplicate protection off (empty match fields)', r.status === 400, r);
  r = await call('PUT', '/admin/settings', { token: adm.data.token, body: { duplicateProtectionDays: -5 } });
  check('admin cannot set negative protection days', r.status === 400, r);
  r = await call('GET', '/admin/partners?name=(a%2B)%2B%24', { token: adm.data.token });
  check('regex search input treated literally (no error)', r.status === 200, r.status);
} else {
  console.log('  SKIP  admin checks (login failed:', adm.status, ')');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
