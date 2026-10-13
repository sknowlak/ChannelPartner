// Fake LinkedIn for tests/e2e/linkedin.e2e.mjs (port 5056): OAuth consent +
// token/refresh, member profile, ad accounts, campaigns, Lead Gen forms and
// lead responses (Rest.li query syntax), daily adAnalytics, conversion rules
// and conversion events, lead-notification subscriptions, and signed
// webhook pushes. Every /rest call must carry LinkedIn-Version and
// X-Restli-Protocol-Version, like the real API.
// Start the backend with:
//   LINKEDIN_CLIENT_ID=mock-client LINKEDIN_CLIENT_SECRET=mock-secret
//   LINKEDIN_AUTH_BASE=http://127.0.0.1:5056/oauth/v2 LINKEDIN_API_BASE=http://127.0.0.1:5056/rest
import http from 'node:http';
import crypto from 'node:crypto';

const CLIENT_ID = 'mock-client';
const CLIENT_SECRET = 'mock-secret';
const calls = [];
let tokenSeq = 1;
const validTokens = new Set();
let refreshToken = 'li-refresh-1';
let conversionSeq = 9000;
let subscriptionSeq = 100;
let leadSeq = 0;
let noAdsAccess = false; // /simulate/no-ads: the app lacks the Advertising API product

const rnd = () => String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
const ACCOUNT = 'urn:li:sponsoredAccount:5001';
const ACCOUNT2 = 'urn:li:sponsoredAccount:5002';
const accounts = {
  5001: { id: 5001, name: 'Prestige Lakeside - LinkedIn', currency: 'INR', status: 'ACTIVE' },
  5002: { id: 5002, name: 'Agency Sandbox', currency: 'INR', status: 'ACTIVE' }
};
const campaigns = { 5001: [{ id: 7001, name: 'Lakeside Launch - Lead Gen' }, { id: 7002, name: 'NRI Investors' }], 5002: [] };
const forms = {
  3162: {
    id: 3162,
    name: 'Lakeside Brochure Form',
    content: {
      questions: [
        { questionId: 1, name: 'firstName', predefinedField: 'FIRST_NAME', question: { localized: { en_US: 'First name' } } },
        { questionId: 2, name: 'lastName', predefinedField: 'LAST_NAME', question: { localized: { en_US: 'Last name' } } },
        { questionId: 3, name: 'email', predefinedField: 'EMAIL', question: { localized: { en_US: 'Email' } } },
        { questionId: 4, name: 'phone', predefinedField: 'PHONE_NUMBER', question: { localized: { en_US: 'Phone' } } },
        { questionId: 5, name: 'company', predefinedField: 'COMPANY_NAME', question: { localized: { en_US: 'Company' } } },
        {
          questionId: 6, name: 'budget', question: { localized: { en_US: 'Budget' } },
          questionDetails: { multipleChoiceQuestionDetails: { options: [{ id: 1, text: { localized: { en_US: 'Under 1 Cr' } } }, { id: 2, text: { localized: { en_US: '1-2 Cr' } } }] } }
        }
      ]
    }
  },
  3163: {
    id: 3163,
    name: 'Webinar Signup (no phone)',
    content: { questions: [{ questionId: 1, predefinedField: 'FIRST_NAME' }, { questionId: 2, predefinedField: 'LAST_NAME' }, { questionId: 3, predefinedField: 'WORK_EMAIL' }] }
  }
};

function makeLead({ account = ACCOUNT, form = 3162, first, last, phone, email, company, budget, campaign = 7001, test = false, submittedAt = Date.now() }) {
  leadSeq += 1;
  const answers = [];
  const add = (questionId, answer) => answer && answers.push({ questionId, answerDetails: { textQuestionAnswer: { answer } } });
  add(1, first); add(2, last); add(3, email);
  if (form === 3162) {
    add(4, phone); add(5, company);
    if (budget) answers.push({ questionId: 6, answerDetails: { multipleChoiceAnswer: { options: [budget] } } });
  }
  return {
    id: `lead-${Date.now().toString(36)}-${leadSeq}`,
    owner: { sponsoredAccount: account },
    leadType: 'SPONSORED',
    testLead: test,
    submittedAt,
    submitter: `urn:li:person:p${leadSeq}`,
    versionedLeadGenFormUrn: `urn:li:versionedLeadGenForm:(urn:li:leadGenForm:${form},1)`,
    leadMetadata: { sponsoredLeadMetadata: { campaign: `urn:li:sponsoredCampaign:${campaign}` } },
    associatedEntity: { associatedCreative: 'urn:li:sponsoredCreative:8801' },
    formResponse: { answers, consentResponses: [] }
  };
}

const hour = 3600000;
const leads = [
  makeLead({ first: 'Ananya', last: 'Rao', phone: `+9198${rnd()}`, email: `ananya.${rnd()}@example.com`, company: 'Infosys', budget: 2, submittedAt: Date.now() - 30 * hour }),
  makeLead({ first: 'Rohit', last: 'Mehta', phone: `97${rnd()}`, email: `rohit.${rnd()}@example.com`, campaign: 7002, submittedAt: Date.now() - 5 * hour }),
  makeLead({ form: 3163, first: 'Kiran', last: 'Shah', email: `kiran.${rnd()}@example.com`, submittedAt: Date.now() - 4 * hour }),
  makeLead({ first: 'Test', last: 'Lead', phone: `+9196${rnd()}`, test: true, submittedAt: Date.now() - 3 * hour })
];

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
const restli = (raw, key) => {
  const m = raw.match(new RegExp(`(?:^|&)${key}=([^&]*)`));
  return m ? decodeURIComponent(m[1]) : '';
};

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', async () => {
    const url = new URL(req.url, 'http://x');
    const rawQuery = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
    if (url.pathname !== '/log') calls.push({ method: req.method, path: url.pathname, query: rawQuery, headers: req.headers, body: raw });
    const p = url.pathname;

    if (p === '/log') return send(res, 200, calls);

    // --- OAuth: consent is granted at once (or denied after /simulate/deny)
    if (p === '/oauth/v2/authorization') {
      const target = new URL(url.searchParams.get('redirect_uri'));
      target.searchParams.set('state', url.searchParams.get('state'));
      if (url.searchParams.get('client_id') !== CLIENT_ID) target.searchParams.set('error', 'invalid_client');
      else target.searchParams.set('code', 'mock-code');
      res.writeHead(302, { Location: target.toString() });
      return res.end();
    }
    if (p === '/oauth/v2/accessToken') {
      const f = new URLSearchParams(raw);
      if (f.get('client_id') !== CLIENT_ID || f.get('client_secret') !== CLIENT_SECRET) return send(res, 401, { error: 'invalid_client' });
      const ok = (f.get('grant_type') === 'authorization_code' && f.get('code') === 'mock-code')
        || (f.get('grant_type') === 'refresh_token' && f.get('refresh_token') === refreshToken);
      if (!ok) return send(res, 400, { error: 'invalid_grant', error_description: 'bad code or refresh token' });
      const access = `li-access-${tokenSeq++}`;
      validTokens.add(access);
      return send(res, 200, {
        access_token: access, expires_in: 5184000, refresh_token: refreshToken, refresh_token_expires_in: 31536000,
        scope: 'r_ads,r_ads_reporting,r_marketing_leadgen_automation,rw_conversions'
      });
    }

    // --- test controls
    if (p === '/simulate/expire') { validTokens.clear(); return send(res, 200, { ok: true }); }
    if (p === '/simulate/no-ads') { noAdsAccess = url.searchParams.get('on') !== 'false'; return send(res, 200, { noAdsAccess }); }
    if (p === '/simulate/lead' && req.method === 'POST') {
      const b = JSON.parse(raw || '{}');
      const lead = makeLead(b);
      leads.push(lead);
      if (b.webhook) {
        const payload = JSON.stringify({
          type: 'LEAD_ACTION', leadGenFormResponse: `urn:li:leadGenFormResponse:${lead.id}`, leadGenForm: `urn:li:leadGenForm:${b.form || 3162}`,
          owner: { sponsoredAccount: lead.owner.sponsoredAccount }, leadType: 'SPONSORED', leadAction: 'CREATED', occurredAt: Date.now()
        });
        const sig = crypto.createHmac('sha256', CLIENT_SECRET).update(`hmacsha256=${payload}`).digest('hex');
        const r = await fetch(b.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-LI-Signature': sig }, body: payload }).catch((e) => ({ status: String(e) }));
        return send(res, 200, { lead, webhookStatus: r.status });
      }
      return send(res, 200, { lead });
    }

    // --- API: auth + version headers
    if (p.startsWith('/rest/') || p.startsWith('/v2/')) {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!validTokens.has(token)) return send(res, 401, { status: 401, message: 'Invalid access token' });
      if (p.startsWith('/rest/') && (!/^\d{6}$/.test(req.headers['linkedin-version'] || '') || req.headers['x-restli-protocol-version'] !== '2.0.0')) {
        return send(res, 400, { status: 400, message: 'Missing LinkedIn-Version / X-Restli-Protocol-Version header' });
      }
    }
    if (p === '/v2/me') return send(res, 200, { id: 'abc123', localizedFirstName: 'Priya', localizedLastName: 'Nair' });
    if (p === '/rest/adAccountUsers' && noAdsAccess) {
      return send(res, 403, { status: 403, serviceErrorCode: 100, message: 'Not enough permissions to access: partnerApiAdAccountUsers.FINDER-authenticatedUser.20260901' });
    }
    if (p === '/rest/adAccountUsers') {
      return send(res, 200, { elements: [{ account: ACCOUNT, role: 'ACCOUNT_MANAGER', user: 'urn:li:person:abc123' }, { account: ACCOUNT2, role: 'VIEWER', user: 'urn:li:person:abc123' }] });
    }
    let m = p.match(/^\/rest\/adAccounts\/(\d+)$/);
    if (m) return accounts[m[1]] ? send(res, 200, accounts[m[1]]) : send(res, 404, { message: 'not found' });
    m = p.match(/^\/rest\/adAccounts\/(\d+)\/adCampaigns$/);
    if (m) return send(res, 200, { elements: campaigns[m[1]] || [], metadata: {} });
    m = p.match(/^\/rest\/leadForms\/(\d+)$/);
    if (m) return forms[m[1]] ? send(res, 200, forms[m[1]]) : send(res, 404, { message: 'form not found' });
    if (p === '/rest/leadFormResponses') {
      const owner = restli(rawQuery, 'owner'); // (sponsoredAccount:urn:li:sponsoredAccount:5001)
      const testOnly = restli(rawQuery, 'limitedToTestLeads') === 'true';
      const range = restli(rawQuery, 'submittedAtTimeRange').match(/start:(\d+),end:(\d+)/);
      const start = Number(restli(rawQuery, 'start') || 0);
      const count = Number(restli(rawQuery, 'count') || 10);
      const hits = leads.filter((l) => owner.includes(l.owner.sponsoredAccount) && l.testLead === testOnly
        && (!range || (l.submittedAt >= Number(range[1]) && l.submittedAt <= Number(range[2]))));
      return send(res, 200, { elements: hits.slice(start, start + count), paging: { start, count, total: hits.length } });
    }
    m = p.match(/^\/rest\/leadFormResponses\/(.+)$/);
    if (m) {
      const lead = leads.find((l) => l.id === decodeURIComponent(m[1]));
      return lead ? send(res, 200, lead) : send(res, 404, { message: 'lead not found' });
    }
    if (p === '/rest/adAnalytics') {
      const accountId = (decodeURIComponent(restli(rawQuery, 'accounts')).match(/sponsoredAccount:(\d+)/) || [])[1];
      const r = rawQuery.match(/dateRange=\(start:\(year:(\d+),month:(\d+),day:(\d+)\),end:\(year:(\d+),month:(\d+),day:(\d+)\)\)/);
      if (!r || !accountId) return send(res, 400, { message: 'dateRange and accounts are required' });
      const elements = [];
      for (let back = 0; back < 10; back++) {
        const d = new Date(Date.now() - back * 86400000);
        const day = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
        for (const c of campaigns[accountId] || []) {
          elements.push({
            dateRange: { start: day, end: day }, pivotValues: [`urn:li:sponsoredCampaign:${c.id}`],
            impressions: 1000 + c.id % 7 * 100, clicks: 20 + back, costInLocalCurrency: String(1500 + back * 10), costInUsd: String(18 + back / 10),
            oneClickLeads: 2, oneClickLeadFormOpens: 9
          });
        }
      }
      return send(res, 200, { elements, paging: { start: 0, count: elements.length } });
    }
    if (p === '/rest/conversions' && req.method === 'POST') {
      const b = JSON.parse(raw || '{}');
      if (!b.account || b.conversionMethod !== 'CONVERSIONS_API' || !b.type) return send(res, 400, { message: 'invalid conversion rule' });
      return send(res, 201, undefined, { 'x-restli-id': String(++conversionSeq) });
    }
    if (p === '/rest/conversionEvents' && req.method === 'POST') {
      const b = JSON.parse(raw || '{}');
      if (!b.conversion || !b.conversionHappenedAt || !b.user) return send(res, 400, { message: 'conversion, conversionHappenedAt and user are required' });
      return send(res, 201);
    }
    if (p === '/rest/leadNotifications' && req.method === 'POST') return send(res, 201, undefined, { 'x-restli-id': String(++subscriptionSeq) });
    if (p.startsWith('/rest/leadNotifications/') && req.method === 'DELETE') return send(res, 204);
    return send(res, 404, { message: 'not found' });
  });
}).listen(5056, () => console.log('mock LinkedIn on 5056'));
