// Run against a RUNNING backend with a seeded admin (npm run seed):
//   ADMIN_PW=<DEFAULT_ADMIN_PASSWORD> E2E_API_URL=http://localhost:5000/api node tests/e2e/disputesBookings.e2e.mjs
// Creates synthetic partners/builders/leads (names prefixed S62) in that database -
// use a development database, never production.
// Section 62: request IDs, server-side logout, per-project protection, booking
// cancellation + re-booking, ownership disputes, partner and admin dashboards.
const BASE = process.env.E2E_API_URL || 'http://localhost:5000/api';
const run = Date.now().toString(36);
let pass = 0, fail = 0;

async function call(method, path, { token, body, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers: h, body: body && method !== 'GET' ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data, headers: res.headers };
}
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  ->  ${JSON.stringify(detail)?.slice(0, 400)}`); }
}
const phone = () => `+9192${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const DAY = 24 * 60 * 60 * 1000;

// ---------- setup ----------
const admin = (await call('POST', '/admin/auth/login', { body: { email: 'admin@leadrat.example', password: process.env.ADMIN_PW } })).data.token;
const b = (await call('POST', '/admin/builders', { token: admin, body: { name: `S62 Builder ${run}` } })).data;
const bEmail = `s62b.${run}@example.com`;
await call('POST', `/admin/builders/${b.builderId}/users`, { token: admin, body: { name: 'S62 Builder User', email: bEmail, password: 'Passw0rd!x' } });
const builderLogin = async () => (await call('POST', '/builder/auth/login', { body: { email: bEmail, password: 'Passw0rd!x' } })).data.token;
const BT = await builderLogin();
const signup = async (tag) => (await call('POST', '/channel-partner/partners/register', {
  body: { name: `S62 Partner ${tag} ${run}`, mobile: phone(), email: `s62${tag}.${run}@example.com`, username: `e2es62${tag}${run}`, password: 'Passw0rd!x' }
})).data;
const A = await signup('a');
const B = await signup('b');
const C = await signup('c');
check('setup: builder, partners', BT && A.token && B.token && C.token, { BT: !!BT });

console.log('\n== Request IDs ==');
let r = await call('GET', '/channel-partner/my/registrations/NOPE', { token: A.token });
check('every response carries X-Request-Id', /^[0-9a-f-]{36}$/.test(r.headers.get('x-request-id') || ''), r.headers.get('x-request-id'));
r = await call('GET', '/channel-partner/does-not-exist', { headers: { 'X-Request-Id': `e2e-${run}-abc` } });
check('a sane caller request ID is echoed, and errors include it', r.headers.get('x-request-id') === `e2e-${run}-abc` && r.data.requestId === `e2e-${run}-abc`, r);
r = await call('GET', '/channel-partner/does-not-exist', { headers: { 'X-Request-Id': 'bad id <script>' } });
check('an unsafe request ID is replaced', r.headers.get('x-request-id') !== 'bad id <script>' && r.data.requestId === r.headers.get('x-request-id'), r.headers.get('x-request-id'));

console.log('\n== Per-project protection window ==');
const projShort = `S62-SHORT-${run}`;
const projDefault = `S62-DEF-${run}`;
r = await call('POST', '/admin/projects', { token: admin, body: { projectId: projShort, name: 'S62 Short', builderId: b.builderId, protectionDays: 5 } });
check('admin creates a project with a 5-day window', r.status === 201 && r.data.protectionDays === 5, r);
r = await call('POST', '/admin/projects', { token: admin, body: { projectId: projDefault, name: 'S62 Default', builderId: b.builderId } });
check('project without a window uses the global default (null)', r.status === 201 && r.data.protectionDays === null, r);
r = await call('PATCH', `/admin/projects/${projShort}`, { token: admin, body: { protectionDays: 0 } });
check('invalid protectionDays refused with fieldKey', r.status === 400 && r.data.fieldKey === 'protectionDays', r);
const settings = (await call('GET', '/admin/settings', { token: admin })).data;
const projects = (await call('GET', '/channel-partner/my/projects', { token: A.token })).data.projects;
check('partners see each project\'s effective window',
  projects.find((p) => p.projectId === projShort)?.protectionDays === 5 && projects.find((p) => p.projectId === projDefault)?.protectionDays === settings.duplicateProtectionDays,
  projects.filter((p) => p.projectId.startsWith('S62')));
r = await call('POST', '/channel-partner/my/registrations', { token: A.token, body: { propertySubType: 'Flat', notes: 's62 test', customer: { name: 'Short Window', mobile: phone() }, projectId: projShort } });
const days = (new Date(r.data.expiryDate) - Date.now()) / DAY;
check('a registration for that project gets 5 days of protection', r.status === 201 && r.data.protectionDays === 5 && days > 4.9 && days <= 5, r.data);

console.log('\n== Duplicate match fields per project ==');
const projEmail = `S62-EMAIL-${run}`;
r = await call('POST', '/admin/projects', { token: admin, body: { projectId: projEmail, name: 'S62 Email match', builderId: b.builderId, duplicateMatchFields: ['email'] } });
check('admin creates a project that matches duplicates on email only', r.status === 201 && JSON.stringify(r.data.duplicateMatchFields) === '["email"]', r);
r = await call('PATCH', `/admin/projects/${projEmail}`, { token: admin, body: { duplicateMatchFields: ['phone'] } });
check('unknown match field refused with fieldKey', r.status === 400 && r.data.fieldKey === 'duplicateMatchFields', r);
const sharedEmail = `same.${run}@example.com`;
const sharedMobile = phone();
await call('POST', '/channel-partner/my/registrations', { token: A.token, body: { propertySubType: 'Flat', notes: 's62 test', customer: { name: 'Email Person', mobile: sharedMobile, email: sharedEmail }, projectId: projEmail } });
r = await call('POST', '/channel-partner/my/registrations', { token: B.token, body: { propertySubType: 'Flat', notes: 's62 test', customer: { name: 'Email Person', mobile: phone(), email: sharedEmail }, projectId: projEmail } });
check('email-only project: same email, different mobile -> duplicate', r.status === 409, r.status);
r = await call('POST', '/channel-partner/my/registrations', { token: B.token, body: { propertySubType: 'Flat', notes: 's62 test', customer: { name: 'Other Person', mobile: sharedMobile, email: `other.${run}@example.com` }, projectId: projEmail } });
check('email-only project: same mobile, different email -> not a duplicate', r.status === 201, r);
const listedProj = (await call('GET', '/channel-partner/my/projects', { token: A.token })).data.projects.find((p) => p.projectId === projEmail);
check('partners see the project\'s match fields', JSON.stringify(listedProj?.matchFields) === '["email"]', listedProj);
r = await call('PATCH', `/admin/projects/${projEmail}`, { token: admin, body: { duplicateMatchFields: null } });
check('clearing the override falls back to the global setting', r.status === 200 && !r.data.duplicateMatchFields, r.data);

console.log('\n== Booking cancellation and re-booking ==');
const mobileBook = phone();
r = await call('POST', '/channel-partner/my/registrations', { token: A.token, body: { propertySubType: 'Flat', notes: 's62 test', customer: { name: 'Booked Buyer', mobile: mobileBook }, projectId: projDefault } });
const leadBook = r.data.registrationId;
await call('POST', `/channel-partner/my/registrations/${leadBook}/progress`, { token: A.token, body: { stage: 'Contacted' } });
const stageBefore = (await call('GET', `/channel-partner/my/registrations/${leadBook}`, { token: A.token })).data.registration.currentStage;
await call('POST', `/builder/referrals/${leadBook}/decision`, { token: BT, body: { decision: 'ACCEPT' } });
r = await call('POST', `/builder/referrals/${leadBook}/booking`, { token: BT, body: {} });
check('builder books the referral', r.status === 201, r);
r = await call('POST', `/builder/referrals/${leadBook}/booking/cancel`, { token: BT, body: {} });
check('cancelling without a reason -> 400', r.status === 400, r);
r = await call('POST', `/channel-partner/my/registrations/${leadBook}/booking/cancel`, { token: A.token, body: { reason: 'x' } });
check('a partner has no cancel route (404)', r.status === 404, r.status);
r = await call('POST', `/builder/referrals/${leadBook}/booking/cancel`, { token: BT, body: { reason: 'Buyer withdrew - loan rejected' } });
check('builder cancels the booking', r.status === 200 && r.data.bookingStatus === 'CANCELLED' && r.data.commissionEligibility === 'CANCELLED', r);
let detail = (await call('GET', `/channel-partner/my/registrations/${leadBook}`, { token: A.token })).data;
check('partner sees: not booked, booking + commission CANCELLED, ownership back, stage restored',
  !detail.registration.isBooked && detail.booking.status === 'CANCELLED' && detail.booking.cancellationReason === 'Buyer withdrew - loan rejected'
  && detail.commission.eligibilityStatus === 'CANCELLED' && detail.ownership.operationalOwner === A.partner.partnerId
  && detail.ownership.ownershipStatus === 'PARTNER_OWNED' && detail.registration.currentStage === stageBefore,
  { booked: detail.registration.isBooked, booking: detail.booking?.status, comm: detail.commission?.eligibilityStatus, own: detail.ownership, stage: detail.registration.currentStage, stageBefore });
const listed = (await call('GET', '/channel-partner/my/registrations', { token: A.token })).data.registrations.find((x) => x.registrationId === leadBook);
check('My Leads list shows the booking as cancelled', listed?.bookingStatus === 'CANCELLED' && !listed.isBooked, listed && { b: listed.bookingStatus });
r = await call('POST', `/builder/referrals/${leadBook}/booking/cancel`, { token: BT, body: { reason: 'again' } });
check('cancelling twice -> 409', r.status === 409, r);
const seen = (await call('GET', `/builder/referrals/${leadBook}`, { token: BT })).data;
check('builder view: CANCELLED, and post-booking contact fields hidden again', seen.bookingStatus === 'CANCELLED' && seen.mobile === undefined, seen);
r = await call('POST', `/builder/referrals/${leadBook}/booking`, { token: BT, body: {} });
check('the lead can be booked again', r.status === 201 && r.data.commissionEligibility === 'ELIGIBLE', r);
detail = (await call('GET', `/channel-partner/my/registrations/${leadBook}`, { token: A.token })).data;
check('re-booking re-uses the booking and commission records (one per lead)',
  detail.booking.status === 'CONFIRMED' && detail.commission.eligibilityStatus === 'ELIGIBLE' && detail.registration.isBooked && !detail.booking.cancellationReason, { b: detail.booking, c: detail.commission });
r = await call('POST', `/admin/registrations/${leadBook}/override`, { token: admin, body: { action: 'CANCEL_BOOKING', reason: 'Admin: duplicate payment' } });
check('an admin can cancel a booking too (CANCEL_BOOKING override)', r.status === 200 && r.data.bookingStatus === 'CANCELLED', r);
const audit = (await call('GET', `/channel-partner/my/registrations/${leadBook}/audit`, { token: A.token })).data.events.map((e) => e.eventType);
check('history has cancel, ownership-return, commission-cancel and restore events',
  ['BOOKING_CANCELLED', 'OPERATIONAL_OWNERSHIP_RETURNED', 'COMMISSION_ELIGIBILITY_CANCELLED', 'COMMISSION_ELIGIBILITY_RESTORED'].every((t) => audit.includes(t)), audit);
const withIds = (await call('GET', `/admin/registrations/${leadBook}/audit`, { token: admin })).data;
const events = withIds.events || withIds;
check('audit entries carry the request ID of the call that wrote them', Array.isArray(events) && events.some((e) => e.eventType === 'BOOKING_CANCELLED' && e.requestId), Array.isArray(events) ? events.slice(-2) : withIds);

console.log('\n== Ownership disputes ==');
const mobileD = phone();
r = await call('POST', '/channel-partner/my/registrations', { token: A.token, body: { propertySubType: 'Flat', notes: 's62 test', customer: { name: 'Disputed Dev', mobile: mobileD }, projectId: projDefault } });
const heldLead = r.data.registrationId;
r = await call('POST', '/channel-partner/my/registrations', { token: B.token, body: { propertySubType: 'Flat', notes: 's62 test', customer: { name: 'Dev (B copy)', mobile: mobileD, email: `devb.${run}@example.com` }, projectId: projDefault } });
check('B is rejected as a duplicate', r.status === 409 && r.data.reasonCode === 'DUPLICATE_PROTECTED', r);

const disputeBody = { customer: { name: 'Dev (B copy)', mobile: mobileD, email: `devb.${run}@example.com` }, projectId: projDefault, reason: 'Site visit done by us on 1 Nov, see WhatsApp log' };
r = await call('POST', '/channel-partner/my/disputes', { token: B.token, body: { ...disputeBody, reason: 'short' } });
check('a too-short reason is refused (and controller-sent errors carry the request ID too)', r.status === 400 && r.data.fieldKey === 'reason' && r.data.requestId === r.headers.get('x-request-id'), r);
r = await call('POST', '/channel-partner/my/disputes', { token: B.token, body: { ...disputeBody, customer: { name: 'Nobody', mobile: phone() } } });
check('disputing an unprotected customer -> 409 NOT_PROTECTED', r.status === 409 && r.data.code === 'NOT_PROTECTED', r);
r = await call('POST', '/channel-partner/my/disputes', { token: A.token, body: { ...disputeBody, customer: { name: 'Disputed Dev', mobile: mobileD } } });
check('the holder cannot dispute its own lead (ALREADY_YOURS)', r.status === 409 && r.data.code === 'ALREADY_YOURS', r);
r = await call('POST', '/channel-partner/my/disputes', { token: B.token, body: disputeBody });
check('B raises a dispute', r.status === 201 && r.data.status === 'OPEN', r);
const disputeB = r.data.disputeId;
const raisedText = JSON.stringify(r.data);
check('the dispute view tells B nothing about the holder', !raisedText.includes(A.partner.partnerId) && !raisedText.includes(heldLead) && !raisedText.includes('Disputed Dev'), r.data);
r = await call('POST', '/channel-partner/my/disputes', { token: B.token, body: disputeBody });
check('a second open dispute for the same customer -> 409 ALREADY_OPEN', r.status === 409 && r.data.code === 'ALREADY_OPEN', r);

detail = (await call('GET', `/channel-partner/my/registrations/${heldLead}`, { token: A.token })).data;
const heldAudit = (await call('GET', `/channel-partner/my/registrations/${heldLead}/audit`, { token: A.token })).data.events;
check('holder A sees its lead marked as disputed', detail.registration.disputeStatus === 'OPEN', detail.registration.disputeStatus);
check('holder\'s history says a dispute was raised, without who or why',
  heldAudit.some((e) => e.eventType === 'OWNERSHIP_DISPUTE_RAISED') && !JSON.stringify(heldAudit).includes(B.partner.partnerId) && !JSON.stringify(heldAudit).includes('WhatsApp'), heldAudit.slice(-1));
r = await call('GET', '/channel-partner/my/disputes', { token: A.token });
check('A does not see B\'s dispute in its own list', r.status === 200 && !r.data.disputes.some((d) => d.disputeId === disputeB), r.data);

r = await call('GET', '/admin/disputes?status=OPEN', { token: admin });
const adminView = r.data.disputes.find((d) => d.disputeId === disputeB);
check('admin lists the open dispute with both sides', adminView && adminView.heldPartnerId === A.partner.partnerId && adminView.partnerId === B.partner.partnerId && adminView.held?.registrationId === heldLead, adminView);
r = await call('POST', `/admin/disputes/${disputeB}/resolve`, { token: admin, body: { outcome: 'OVERTURNED' } });
check('resolving without a note -> 400', r.status === 400 && r.data.fieldKey === 'note', r);

// C disputes too, then withdraws; and C's second dispute gets upheld.
r = await call('POST', '/channel-partner/my/disputes', { token: C.token, body: { ...disputeBody, customer: { name: 'Dev (C)', mobile: mobileD } } });
const disputeC = r.data.disputeId;
r = await call('POST', `/channel-partner/my/disputes/${disputeC}/withdraw`, { token: B.token });
check('another partner cannot withdraw C\'s dispute', r.status === 404, r.status);
r = await call('POST', `/channel-partner/my/disputes/${disputeC}/withdraw`, { token: C.token });
check('C withdraws its dispute', r.status === 200 && r.data.status === 'WITHDRAWN', r);
detail = (await call('GET', `/channel-partner/my/registrations/${heldLead}`, { token: A.token })).data;
check('held lead stays disputed while B\'s dispute is still open', detail.registration.disputeStatus === 'OPEN', detail.registration.disputeStatus);
r = await call('POST', '/channel-partner/my/disputes', { token: C.token, body: { ...disputeBody, customer: { name: 'Dev (C)', mobile: mobileD } } });
const disputeC2 = r.data.disputeId;
r = await call('POST', `/admin/disputes/${disputeC2}/resolve`, { token: admin, body: { outcome: 'UPHELD', note: 'A registered first and has the site visit record' } });
check('admin upholds C\'s dispute (owner keeps the customer)', r.status === 200 && r.data.status === 'UPHELD', r);

// A booked held lead can't be overturned.
await call('POST', `/builder/referrals/${heldLead}/decision`, { token: BT, body: { decision: 'ACCEPT' } });
await call('POST', `/builder/referrals/${heldLead}/booking`, { token: BT, body: {} });
detail = (await call('GET', `/channel-partner/my/registrations/${heldLead}`, { token: A.token })).data;
check('a commission on a disputed lead is marked DISPUTED', detail.commission?.attributionStatus === 'DISPUTED', detail.commission);
r = await call('POST', `/admin/disputes/${disputeB}/resolve`, { token: admin, body: { outcome: 'OVERTURNED', note: 'B proved first contact' } });
check('overturning while the holder is booked -> 409 HELD_BOOKED', r.status === 409 && r.data.code === 'HELD_BOOKED', r);
await call('POST', `/builder/referrals/${heldLead}/booking/cancel`, { token: BT, body: { reason: 'Pending dispute review' } });

r = await call('POST', `/admin/disputes/${disputeB}/resolve`, { token: admin, body: { outcome: 'OVERTURNED', note: 'B proved first contact' } });
check('admin overturns B\'s dispute', r.status === 200 && r.data.status === 'OVERTURNED' && r.data.resultRegistrationId, r);
const newLead = r.data.resultRegistrationId;
detail = (await call('GET', `/channel-partner/my/registrations/${newLead}`, { token: B.token })).data;
check('B now holds a protected lead with B\'s own contact copy', detail.registration?.status === 'ACCEPTED' && detail.registration.protectionExpiry > new Date().toISOString() && detail.customer.email === `devb.${run}@example.com`, detail.customer);
detail = (await call('GET', `/channel-partner/my/registrations/${heldLead}`, { token: A.token })).data;
check('A keeps its lead and history, but its protection has ended and the flag is cleared',
  detail.registration.partnerId === A.partner.partnerId && new Date(detail.registration.protectionExpiry) <= new Date() && detail.registration.disputeStatus === '', detail.registration);
r = await call('GET', '/channel-partner/my/disputes', { token: B.token });
check('B sees the outcome and its new lead', r.data.disputes.find((d) => d.disputeId === disputeB)?.resultRegistrationId === newLead, r.data.disputes[0]);
const builderAudit = (await call('GET', `/builder/referrals/${heldLead}/audit`, { token: BT })).data.events.map((e) => e.eventType);
check('the builder\'s history of the lead leaves out the partner dispute', builderAudit.length > 0 && !builderAudit.some((t) => /DISPUTE/.test(t)), builderAudit);
r = await call('POST', `/admin/disputes/${disputeB}/resolve`, { token: admin, body: { outcome: 'UPHELD', note: 'again' } });
check('a closed dispute cannot be resolved again (409)', r.status === 409, r);
r = await call('POST', '/channel-partner/my/registrations', { token: A.token, body: { propertySubType: 'Flat', notes: 's62 test', customer: { name: 'Dev again', mobile: mobileD }, projectId: projDefault } });
check('now B holds protection: A re-registering is rejected', r.status === 409, r);

console.log('\n== Dashboards ==');
r = await call('GET', `/channel-partner/my/dashboard?days=30&tz=${encodeURIComponent('Asia/Kolkata')}`, { token: A.token });
const t = r.data.totals || {};
check('partner dashboard totals', r.status === 200 && t.leads >= 3 && t.accepted >= 3 && typeof t.conversionRate === 'number' && r.data.timezone === 'Asia/Kolkata', r.data.totals);
check('partner dashboard breakdowns + trend', r.data.byStage.length > 0 && r.data.trend.registrations.length > 0 && r.data.commission.CANCELLED >= 1, { stage: r.data.byStage, trend: r.data.trend, c: r.data.commission });
check('short-window lead shows in "expiring soon"', r.data.expiringSoon.some((x) => x.customerName === 'Short Window'), r.data.expiringSoon);
r = await call('GET', '/channel-partner/my/dashboard?tz=Not/AZone', { token: B.token });
check('an invalid timezone falls back to UTC; B\'s raised disputes are counted', r.data.timezone === 'UTC' && r.data.disputes.OVERTURNED === 1, r.data);
r = await call('GET', '/admin/dashboard', { token: admin });
check('admin dashboard has disputes, cancellations, trend and leaderboard',
  r.status === 200 && typeof r.data.openDisputes === 'number' && r.data.cancelledBookings >= 2 && Array.isArray(r.data.registrationTrend) && Array.isArray(r.data.leaderboard) && r.data.leaderboard.length > 0, r.data);

console.log('\n== Logout revokes the session ==');
const login = async (path, body) => (await call('POST', path, { body })).data.token;
const pTok = await login('/channel-partner/partners/login', { username: `e2es62c${run}`, password: 'Passw0rd!x' });
const pTok2 = await login('/channel-partner/partners/login', { username: `e2es62c${run}`, password: 'Passw0rd!x' });
r = await call('POST', '/channel-partner/my/logout', { token: pTok });
check('partner logout -> 200', r.status === 200 && r.data.loggedOut === true, r);
r = await call('GET', '/channel-partner/my/profile', { token: pTok });
check('the logged-out partner token is refused', r.status === 401, r);
r = await call('GET', '/channel-partner/my/profile', { token: pTok2 });
check('another session of the same partner keeps working', r.status === 200, r.status);
r = await call('POST', '/builder/auth/logout', { token: BT });
check('builder logout', r.status === 200, r);
r = await call('GET', '/builder/referrals', { token: BT });
check('the logged-out builder token is refused', r.status === 401, r.status);
const aTok = await login('/admin/auth/login', { email: 'admin@leadrat.example', password: process.env.ADMIN_PW });
await call('POST', '/admin/auth/logout', { token: aTok });
r = await call('GET', '/admin/dashboard', { token: aTok });
check('the logged-out admin token is refused', r.status === 401, r.status);
r = await call('GET', '/admin/dashboard', { token: admin });
check('the admin\'s other session still works', r.status === 200, r.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
