import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLinkedInStats } from '../api/client';
import { formatNumber, intlLocale } from '../i18n/format';
import DailyBarChart from './DailyBarChart';

// LinkedIn performance (section 59): headline tiles (spend, leads, cost per
// lead), leads/day and spend/day as two separate charts (different scales,
// never one dual-axis chart), the same numbers as a table, and a
// per-campaign breakdown.

const RANGES = [7, 30, 90];
const SERIES_LINKEDIN = '#2a78d6'; // validated categorical slot 1
const SERIES_CREATED = '#eb6834'; // slot 2
const SERIES_SPEND = '#6250d6'; // slot 7, single series

const ymd = (d) => d.toISOString().slice(0, 10);

function money(value, currency, digits = 0) {
  if (value === null || value === undefined) return '-';
  try {
    return new Intl.NumberFormat(intlLocale(), {
      style: 'currency', currency: currency || 'USD', currencyDisplay: 'code', maximumFractionDigits: digits, minimumFractionDigits: 0
    }).format(value);
  } catch {
    return `${currency} ${formatNumber(value)}`;
  }
}

export default function LinkedInPerformance({ refreshKey }) {
  const { t } = useTranslation(['connectors', 'common']);
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86400000);
    setError(null);
    getLinkedInStats({ from: ymd(from), to: ymd(to) })
      .then(({ data }) => setReport(data))
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, [days, refreshKey]);

  if (error) return <div className="card"><div className="error-box">{error}</div></div>;
  if (!report) return <div className="card"><p className="hint">{t('common:states.loading')}</p></div>;

  const { totals: tt, currency } = report;
  const cpl = (v) => money(v, currency, v !== null && v < 100 ? 2 : 0);
  const pct = (v) => (v === null ? '-' : `${formatNumber(v, { maximumFractionDigits: 2 })}%`);
  const dateLabel = (date, long) => new Date(`${date}T00:00:00Z`).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', ...(long ? { year: 'numeric', weekday: 'short' } : {}), timeZone: 'UTC' });
  const hasData = report.daily.some((d) => d.spend || d.linkedinLeads || d.created || d.duplicates || d.rejected);

  const tiles = [
    { label: t('stats.spend'), value: currency ? money(tt.spend, currency) : '-', lead: true },
    { label: t('stats.linkedinLeads'), value: formatNumber(tt.linkedinLeads), lead: true },
    { label: t('stats.cpl'), value: cpl(tt.cpl), hint: t('stats.cplHint'), lead: true },
    { label: t('stats.created'), value: formatNumber(tt.created) },
    { label: t('stats.costPerCrmLead'), value: cpl(tt.costPerCrmLead), hint: t('stats.costPerCrmLeadHint') },
    { label: t('stats.duplicates'), value: formatNumber(tt.duplicates) },
    { label: t('stats.rejected'), value: formatNumber(tt.rejected) },
    { label: t('stats.impressions'), value: formatNumber(tt.impressions) },
    { label: t('stats.clicks'), value: formatNumber(tt.clicks) },
    { label: t('stats.ctr'), value: pct(tt.ctr) }
  ];
  const campaignName = (c) => c.name || t('stats.unnamedCampaign', { id: c.campaignUrn.split(':').pop() });

  return (
    <div className="card">
      <div className="li-section-head">
        <h3>{t('stats.title')}</h3>
        <div className="segmented" role="group" aria-label={t('stats.title')}>
          {RANGES.map((n) => (
            <button key={n} type="button" className={days === n ? 'active' : ''} aria-pressed={days === n} onClick={() => setDays(n)}>
              {t(`stats.range${n}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">
        {t('stats.rangeLabel', { from: dateLabel(report.from, true), to: dateLabel(report.to, true) })} · {t('stats.allTime', { created: formatNumber(report.allTime.created), received: formatNumber(report.allTime.received) })}
      </p>

      <div className="stat-grid">
        {tiles.map((tile) => (
          <div key={tile.label} className={`stat-tile${tile.lead ? ' lead' : ''}`} title={tile.hint || undefined}>
            <span className="label">{tile.label}</span>
            <span className="value">{tile.value}</span>
            {tile.hint && <span className="tile-hint">{tile.hint}</span>}
          </div>
        ))}
      </div>

      {!hasData && <p className="hint">{t('stats.noData')}</p>}

      {hasData && (
        <>
          <div className="li-section-head">
            <span />
            <button type="button" className="secondary" onClick={() => setAsTable((v) => !v)}>{asTable ? t('stats.showChart') : t('stats.showTable')}</button>
          </div>
          {!asTable ? (
            <div className="viz-pair">
              <DailyBarChart
                title={t('stats.leadsChart')}
                integer
                data={report.daily}
                series={[
                  { key: 'linkedinLeads', label: t('stats.linkedinLeads'), color: SERIES_LINKEDIN },
                  { key: 'created', label: t('stats.created'), color: SERIES_CREATED }
                ]}
                formatValue={(v) => formatNumber(v)}
                dateLabel={dateLabel}
                tooltipRows={(d) => [
                  { label: t('stats.linkedinLeads'), value: formatNumber(d.linkedinLeads), color: SERIES_LINKEDIN },
                  { label: t('stats.created'), value: formatNumber(d.created), color: SERIES_CREATED },
                  { label: t('stats.duplicates'), value: formatNumber(d.duplicates) },
                  { label: t('stats.rejected'), value: formatNumber(d.rejected) }
                ]}
              />
              <DailyBarChart
                title={t('stats.spendChart')}
                data={report.daily}
                series={[{ key: 'spend', label: t('stats.spend'), color: SERIES_SPEND }]}
                formatValue={(v) => money(v, currency)}
                formatAxis={(v) => formatNumber(v, { notation: 'compact' })}
                dateLabel={dateLabel}
                tooltipRows={(d) => [
                  { label: t('stats.spend'), value: money(d.spend, currency), color: SERIES_SPEND },
                  { label: t('stats.cpl'), value: cpl(d.cpl) }
                ]}
              />
            </div>
          ) : (
            <div className="table-scroll">
              <table className="pro-table">
                <thead>
                  <tr>
                    <th>{t('stats.date')}</th><th>{t('stats.spend')}</th><th>{t('stats.linkedinLeads')}</th><th>{t('stats.cpl')}</th>
                    <th>{t('stats.created')}</th><th>{t('stats.duplicates')}</th><th>{t('stats.rejected')}</th><th>{t('stats.impressions')}</th><th>{t('stats.clicks')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.daily].reverse().map((d) => (
                    <tr key={d.date}>
                      <td>{dateLabel(d.date, true)}</td><td>{money(d.spend, currency)}</td><td>{formatNumber(d.linkedinLeads)}</td><td>{cpl(d.cpl)}</td>
                      <td>{formatNumber(d.created)}</td><td>{formatNumber(d.duplicates)}</td><td>{formatNumber(d.rejected)}</td><td>{formatNumber(d.impressions)}</td><td>{formatNumber(d.clicks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {report.campaigns.length > 0 && (
            <>
              <h4 className="li-subhead">{t('stats.campaigns')}</h4>
              <div className="table-scroll">
                <table className="pro-table">
                  <thead>
                    <tr>
                      <th>{t('stats.campaign')}</th><th>{t('stats.spend')}</th><th>{t('stats.linkedinLeads')}</th><th>{t('stats.cpl')}</th>
                      <th>{t('stats.created')}</th><th>{t('stats.costPerCrmLead')}</th><th>{t('stats.duplicates')}</th><th>{t('stats.rejected')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.campaigns.map((c) => (
                      <tr key={c.campaignUrn}>
                        <td className="primary-cell" title={c.campaignUrn}>{campaignName(c)}</td><td>{money(c.spend, currency)}</td><td>{formatNumber(c.linkedinLeads)}</td>
                        <td>{cpl(c.cpl)}</td><td>{formatNumber(c.created)}</td><td>{cpl(c.costPerCrmLead)}</td><td>{formatNumber(c.duplicates)}</td><td>{formatNumber(c.rejected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="hint">{t('stats.dataNote')}</p>
        </>
      )}
    </div>
  );
}
