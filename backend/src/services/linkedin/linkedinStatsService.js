const LinkedInAdStat = require('../../models/LinkedInAdStat');
const LinkedInLead = require('../../models/LinkedInLead');
const { liRequest, enc, campaignNames } = require('./linkedinApi');

// Ad spend and lead counts for the LinkedIn page (section 59).
//  - LinkedIn side: adAnalytics per campaign per day (spend, impressions,
//    clicks, leads LinkedIn counted) copied into LinkedInAdStat.
//  - Leadrat side: LinkedInLead (what each lead became).
// Cost per lead = spend / leads LinkedIn counted; cost per CRM lead =
// spend / leads actually created in Leadrat (duplicates and rejected excluded).

const FIRST_SYNC_DAYS = 90;
const REFRESH_DAYS = 14; // LinkedIn finalises recent figures over a few days
const FIELDS = 'dateRange,pivotValues,impressions,clicks,costInLocalCurrency,costInUsd,oneClickLeads,oneClickLeadFormOpens';

const ymd = (d) => d.toISOString().slice(0, 10);
const liDate = (d) => `(year:${d.getUTCFullYear()},month:${d.getUTCMonth() + 1},day:${d.getUTCDate()})`;
const fromLiDate = (p) => `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function syncStats(conn) {
  const end = new Date();
  const start = new Date(end.getTime() - (conn.statsSyncedAt ? REFRESH_DAYS : FIRST_SYNC_DAYS) * 86400000);
  let rows = 0;
  const errors = [];
  for (const account of conn.adAccounts.filter((a) => a.enabled)) {
    try {
      const names = await campaignNames(conn, account.accountUrn).catch(() => new Map());
      const query = `q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY&dateRange=(start:${liDate(start)},end:${liDate(end)})`
        + `&accounts=List(${enc(account.accountUrn)})&fields=${FIELDS}`;
      const r = await liRequest(conn, 'GET', '/adAnalytics', { query });
      for (const el of r.data?.elements || []) {
        const campaignUrn = el.pivotValues?.[0];
        if (!campaignUrn || !el.dateRange?.start) continue;
        await LinkedInAdStat.findOneAndUpdate(
          { partnerId: conn.partnerId, campaignUrn, date: fromLiDate(el.dateRange.start) },
          {
            $set: {
              accountUrn: account.accountUrn,
              campaignName: names.get(campaignUrn) || '',
              currency: account.currency || '',
              cost: num(el.costInLocalCurrency),
              costUsd: num(el.costInUsd),
              impressions: num(el.impressions),
              clicks: num(el.clicks),
              leads: num(el.oneClickLeads),
              formOpens: num(el.oneClickLeadFormOpens)
            }
          },
          { upsert: true }
        );
        rows += 1;
      }
    } catch (err) {
      if (err.needsReconnect) throw err;
      errors.push(`${account.name || account.accountUrn}: ${err.message}`);
    }
  }
  if (!errors.length) conn.statsSyncedAt = new Date();
  return { rows, errors };
}

const ratio = (a, b) => (b > 0 ? Math.round((a / b) * 100) / 100 : null);

// Report for the LinkedIn page. from/to: YYYY-MM-DD (inclusive, UTC days).
async function statsReport(partnerId, { from, to } = {}) {
  const today = ymd(new Date());
  const toDay = /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : today;
  const fromDay = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : ymd(new Date(Date.parse(toDay) - 29 * 86400000));

  const [ads, leads, allTime] = await Promise.all([
    LinkedInAdStat.find({ partnerId, date: { $gte: fromDay, $lte: toDay } }).lean(),
    LinkedInLead.find({ partnerId, submittedAt: { $gte: new Date(`${fromDay}T00:00:00Z`), $lte: new Date(`${toDay}T23:59:59.999Z`) } })
      .select('submittedAt outcome campaignUrn campaignName testLead').lean(),
    LinkedInLead.aggregate([{ $match: { partnerId } }, { $group: { _id: '$outcome', n: { $sum: 1 } } }])
  ]);

  // One currency -> report in it; mixed ad-account currencies -> USD.
  const currencies = [...new Set(ads.map((a) => a.currency).filter(Boolean))];
  const useUsd = currencies.length > 1;
  const currency = useUsd ? 'USD' : currencies[0] || '';
  const costOf = (a) => (useUsd ? a.costUsd : a.cost);

  const days = new Map();
  for (let t = Date.parse(fromDay); t <= Date.parse(toDay); t += 86400000) {
    days.set(ymd(new Date(t)), { date: ymd(new Date(t)), spend: 0, impressions: 0, clicks: 0, linkedinLeads: 0, created: 0, duplicates: 0, rejected: 0, failed: 0 });
  }
  const campaigns = new Map();
  const campaign = (urn, name) => {
    if (!campaigns.has(urn)) campaigns.set(urn, { campaignUrn: urn, name: name || '', spend: 0, impressions: 0, clicks: 0, linkedinLeads: 0, created: 0, duplicates: 0, rejected: 0 });
    const c = campaigns.get(urn);
    if (!c.name && name) c.name = name;
    return c;
  };

  for (const a of ads) {
    const d = days.get(a.date);
    if (d) { d.spend += costOf(a); d.impressions += a.impressions; d.clicks += a.clicks; d.linkedinLeads += a.leads; }
    const c = campaign(a.campaignUrn, a.campaignName);
    c.spend += costOf(a); c.impressions += a.impressions; c.clicks += a.clicks; c.linkedinLeads += a.leads;
  }
  const key = { CREATED: 'created', DUPLICATE: 'duplicates', REJECTED: 'rejected', FAILED: 'failed' };
  for (const l of leads) {
    const d = days.get(ymd(new Date(l.submittedAt)));
    if (d) d[key[l.outcome]] += 1;
    if (l.campaignUrn) {
      const c = campaign(l.campaignUrn, l.campaignName);
      if (c[key[l.outcome]] !== undefined) c[key[l.outcome]] += 1;
    }
  }

  const round = (n) => Math.round(n * 100) / 100;
  const daily = [...days.values()].map((d) => ({ ...d, spend: round(d.spend), cpl: ratio(d.spend, d.linkedinLeads) }));
  const sum = (k) => daily.reduce((s, d) => s + d[k], 0);
  const totals = {
    spend: round(sum('spend')),
    impressions: sum('impressions'),
    clicks: sum('clicks'),
    linkedinLeads: sum('linkedinLeads'),
    received: leads.length,
    created: sum('created'),
    duplicates: sum('duplicates'),
    rejected: sum('rejected'),
    failed: sum('failed')
  };
  totals.cpl = ratio(totals.spend, totals.linkedinLeads);
  totals.costPerCrmLead = ratio(totals.spend, totals.created);
  totals.ctr = totals.impressions ? Math.round((totals.clicks / totals.impressions) * 10000) / 100 : null;

  const byOutcome = Object.fromEntries(allTime.map((g) => [g._id, g.n]));
  return {
    from: fromDay,
    to: toDay,
    currency,
    totals,
    allTime: { received: Object.values(byOutcome).reduce((s, n) => s + n, 0), created: byOutcome.CREATED || 0 },
    daily,
    campaigns: [...campaigns.values()]
      .map((c) => ({ ...c, spend: round(c.spend), cpl: ratio(c.spend, c.linkedinLeads), costPerCrmLead: ratio(c.spend, c.created) }))
      .sort((a, b) => b.spend - a.spend || b.created - a.created)
  };
}

module.exports = { syncStats, statsReport };
