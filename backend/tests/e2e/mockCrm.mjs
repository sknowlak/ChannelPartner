// Fake external CRM for tests/e2e/integrations.e2e.mjs (port 5055): OAuth2 token
// endpoint, auth-checking lead API that returns record IDs, HMAC/Basic/query-key
// checks, a failing endpoint and a paged lead list.
import http from 'node:http';
import crypto from 'node:crypto';

const calls = [];
let leadSeq = 0;
let flaky = 0;
const HMAC_SECRET = 'hmac-secret-123';
const pullRecords = [
  { id: 'P-1', person: { full_name: 'Pull One', phone: '9811111111' }, status: 'new' },
  { id: 'P-2', person: { full_name: 'Pull Two', phone: '9822222222' }, status: 'qualified' },
  { id: 'P-3', person: { full_name: 'Pull Three', phone: '9833333333' }, status: 'new' }
];

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const call = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body: raw };
    if (url.pathname !== '/log') calls.push(call);

    if (url.pathname === '/log') return send(res, 200, calls);
    if (url.pathname === '/oauth/token') {
      const p = new URLSearchParams(raw);
      const basic = (req.headers.authorization || '').replace('Basic ', '');
      const [bid, bsecret] = Buffer.from(basic, 'base64').toString().split(':');
      const ok = (p.get('client_id') === 'cid' && p.get('client_secret') === 'csecret') || (bid === 'cid' && bsecret === 'csecret');
      if (p.get('grant_type') !== 'client_credentials' || !ok) return send(res, 401, { error: 'invalid_client' });
      return send(res, 200, { access_token: 'tok-1', token_type: 'Bearer', expires_in: 3600 });
    }
    if (url.pathname === '/crm/leads' && req.method === 'POST') {
      if (req.headers.authorization !== 'Bearer tok-1') return send(res, 401, { error: 'unauthorized' });
      leadSeq += 1;
      return send(res, 201, { data: { id: `EXT-${leadSeq}` } });
    }
    if (url.pathname.startsWith('/crm/leads/') && req.method === 'PUT') {
      if (req.headers.authorization !== 'Bearer tok-1') return send(res, 401, { error: 'unauthorized' });
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/hmac') {
      const expected = `sha256=${crypto.createHmac('sha256', HMAC_SECRET).update(raw).digest('hex')}`;
      return req.headers['x-sig'] === expected ? send(res, 200, { verified: true }) : send(res, 401, { verified: false });
    }
    if (url.pathname === '/querykey') {
      return url.searchParams.get('key') === 'qsecret' ? send(res, 200, { ok: true }) : send(res, 401, { ok: false });
    }
    if (url.pathname === '/basic') {
      const ok = req.headers.authorization === `Basic ${Buffer.from('user:pass').toString('base64')}`;
      return send(res, ok ? 200 : 401, { ok });
    }
    if (url.pathname === '/flaky') {
      flaky += 1;
      return send(res, 503, { error: 'try later' });
    }
    if (url.pathname === '/api/leads') {
      if (url.searchParams.get('key') !== 'pullkey') return send(res, 401, { error: 'bad key' });
      const page = Number(url.searchParams.get('page') || 1);
      const per = Number(url.searchParams.get('per_page') || 2);
      // ?seed= varies the phone numbers so each test run imports fresh customers.
      const seed = url.searchParams.get('seed') || '';
      const phoneFor = (id) => `98${String(parseInt(crypto.createHash('md5').update(seed + id).digest('hex').slice(0, 8), 16) % 1e8).padStart(8, '0')}`;
      const items = pullRecords.slice((page - 1) * per, page * per).map((r) => ({ ...r, person: { ...r.person, phone: phoneFor(r.id) } }));
      return send(res, 200, { items, meta: { page } });
    }
    if (url.pathname === '/hooks-in') return send(res, 200, { received: true });
    return send(res, 404, { error: 'not found' });
  });
}).listen(5055, () => console.log('mock CRM on 5055'));
