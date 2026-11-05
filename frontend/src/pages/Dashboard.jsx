import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getMyDashboard } from '../api/client';
import { useAuth } from '../context/AuthContext';
import DailyBarChart from '../components/DailyBarChart';
import { formatNumber, intlLocale } from '../i18n/format';
import { useDataLabels } from '../i18n/dataLabels';
import { effectiveTimezone, formatDate } from '../utils/timezone';
import { PERMISSIONS } from '../utils/permissions';

// The partner's own dashboard (section 62): headline numbers, registrations
// vs bookings per day, where the leads stand, and the leads whose duplicate
// protection runs out soon. Everything is scoped server-side to this
// partner's registrations, like My Leads.

const RANGES = [7, 30, 90];
// Validated categorical slots; light/dark steps come from the theme (theme.css).
const SERIES_REGISTRATIONS = 'var(--viz-1)';
const SERIES_BOOKINGS = 'var(--viz-2)';
const DAY = 24 * 60 * 60 * 1000;

const REFERRAL_STATUSES = new Set(['NOT_REFERRED', 'PENDING_BUILDER', 'ACCEPTED', 'REJECTED']);
const SOURCES = new Set(['LEADRAT', 'SIMULATED_EXTERNAL_CRM', 'PARTNER_CRM', 'EXTERNAL_API', 'INTEGRATION_CONNECTOR', 'LINKEDIN']);
const DISPUTE_STATUSES = ['OPEN', 'UPHELD', 'OVERTURNED', 'WITHDRAWN'];

// 'YYYY-MM-DD' of an instant on the wall calendar of `timezone`.
function dayKey(value, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

// The server only sends days that had activity; the chart needs every day of
// the period, so missing ones are filled with zero.
function fillDays(trend, days, timezone) {
  const counts = (rows) => new Map((rows || []).map((r) => [r.date, r.count]));
  const regs = counts(trend.registrations);
  const books = counts(trend.bookings);
  const first = dayKey(Date.now() - days * DAY, timezone);
  const last = dayKey(Date.now(), timezone);
  const out = [];
  for (let d = new Date(`${first}T00:00:00Z`); ; d = new Date(d.getTime() + DAY)) {
    const date = d.toISOString().slice(0, 10);
    out.push({ date, registrations: regs.get(date) || 0, bookings: books.get(date) || 0 });
    if (date >= last || out.length > 400) break;
  }
  return out;
}

// One labelled horizontal bar per row, longest first (rows come sorted).
function BreakdownBars({ title, rows, label, empty }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {rows.length === 0 ? <p className="hint">{empty}</p> : (
        <ul className="hbar-list">
          {rows.map((r) => (
            <li key={r.key || '-'}>
              <span className="hbar-label">{label(r.key)}</span>
              <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(r.count / max) * 100}%` }} /></span>
              <span className="hbar-value">{formatNumber(r.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation(['leads', 'common']);
  const { statusLabel } = useDataLabels();
  const { partner, hasPermission } = useAuth();
  const timezone = effectiveTimezone(partner.timezone);
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setError(null);
    // Days are bucketed in the zone this user sees times in, so "today" on
    // the chart is the same day as everywhere else in the app.
    getMyDashboard({ days, tz: timezone })
      .then(({ data }) => setReport(data))
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, [days, timezone]);

  if (error) return <div className="page page-wide"><div className="error-box">{error}</div></div>;
  if (!report) return <div className="page page-wide">{t('common:states.loading')}</div>;

  const { totals } = report;
  const count = (v) => formatNumber(v || 0);
  const dateLabel = (date, long) => new Date(`${date}T00:00:00Z`).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', ...(long ? { year: 'numeric', weekday: 'short' } : {}), timeZone: 'UTC' });

  if (!totals.leads) {
    return (
      <div className="page page-wide">
        <h1>{t('leads:dashboard.title')}</h1>
        <div className="card">
          <p>{t('leads:dashboard.emptyTitle')}</p>
          <p className="hint">{t('leads:dashboard.emptyHint')}</p>
          {hasPermission(PERMISSIONS.MANAGE_LEADS) && (
            <Link to="/register-lead"><button className="primary">{t('leads:list.addLead')}</button></Link>
          )}
        </div>
      </div>
    );
  }

  const tiles = [
    { label: t('leads:dashboard.tiles.leads'), value: count(totals.leads), hint: t('leads:dashboard.tiles.newInPeriod', { count: totals.newInPeriod || 0 }), lead: true },
    { label: t('leads:dashboard.tiles.accepted'), value: count(totals.accepted), lead: true },
    { label: t('leads:dashboard.tiles.booked'), value: count(totals.booked), hint: t('leads:dashboard.tiles.bookedInPeriod', { count: totals.bookedInPeriod || 0 }), lead: true },
    { label: t('leads:dashboard.tiles.conversion'), value: formatNumber((totals.conversionRate || 0) / 100, { style: 'percent', maximumFractionDigits: 1 }), hint: t('leads:dashboard.tiles.conversionHint'), lead: true },
    { label: t('leads:dashboard.tiles.protectedNow'), value: count(totals.protectedNow) },
    { label: t('leads:dashboard.tiles.expiringSoon', { count: report.expiringWithinDays }), value: count(totals.expiringSoon) },
    { label: t('leads:dashboard.tiles.disputedNow'), value: count(totals.disputedNow), hint: t('leads:dashboard.tiles.disputedNowHint') },
    {
      label: t('leads:dashboard.tiles.commissionEligible'),
      value: count(report.commission?.ELIGIBLE),
      hint: report.commission?.CANCELLED ? t('leads:dashboard.tiles.commissionCancelled', { count: report.commission.CANCELLED }) : undefined
    }
  ];

  const chartData = fillDays(report.trend || {}, report.periodDays || days, timezone);
  const series = [
    { key: 'registrations', label: t('leads:dashboard.chart.registrations'), color: SERIES_REGISTRATIONS },
    { key: 'bookings', label: t('leads:dashboard.chart.bookings'), color: SERIES_BOOKINGS }
  ];
  const disputeRows = DISPUTE_STATUSES.filter((s) => report.disputes?.[s]).map((s) => ({ key: s, count: report.disputes[s] }));

  return (
    <div className="page page-wide">
      <div className="li-section-head">
        <h1 style={{ margin: 0 }}>{t('leads:dashboard.title')}</h1>
        <div className="segmented" role="group" aria-label={t('leads:dashboard.period')}>
          {RANGES.map((n) => (
            <button key={n} type="button" className={days === n ? 'active' : ''} aria-pressed={days === n} onClick={() => setDays(n)}>
              {t('leads:dashboard.lastDays', { count: n })}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">{t('leads:journey.timesIn', { timezone })}</p>

      <div className="stat-grid">
        {tiles.map((tile) => (
          <div key={tile.label} className={`stat-tile${tile.lead ? ' lead' : ''}`} title={tile.hint || undefined}>
            <span className="label">{tile.label}</span>
            <span className="value">{tile.value}</span>
            {tile.hint && <span className="tile-hint">{tile.hint}</span>}
          </div>
        ))}
      </div>

      <div className="card">
        <DailyBarChart
          title={t('leads:dashboard.chart.title', { count: report.periodDays || days })}
          integer
          data={chartData}
          series={series}
          formatValue={(v) => formatNumber(v)}
          dateLabel={dateLabel}
        />
      </div>

      <div className="dash-breakdowns">
        <BreakdownBars
          title={t('leads:dashboard.byStage')}
          rows={report.byStage || []}
          label={(key) => (key ? statusLabel(key) : t('leads:dashboard.unknown'))}
          empty={t('common:states.empty')}
        />
        <BreakdownBars
          title={t('leads:dashboard.bySource')}
          rows={report.bySource || []}
          label={(key) => (SOURCES.has(key) ? t(`leads:dashboard.sources.${key}`) : key || t('leads:dashboard.unknown'))}
          empty={t('common:states.empty')}
        />
        <BreakdownBars
          title={t('leads:dashboard.byReferral')}
          rows={report.byReferral || []}
          label={(key) => (REFERRAL_STATUSES.has(key) ? t(`leads:referral.${key}`) : key || t('leads:dashboard.unknown'))}
          empty={t('common:states.empty')}
        />
        <BreakdownBars
          title={t('leads:dashboard.myDisputes')}
          rows={disputeRows}
          label={(key) => t(`leads:disputes.status.${key}`)}
          empty={t('leads:dashboard.noDisputes')}
        />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('leads:dashboard.expiringTitle', { count: report.expiringWithinDays })}</h3>
        {(report.expiringSoon || []).length === 0 ? (
          <p className="hint">{t('leads:dashboard.expiringEmpty')}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('leads:list.registrationId')}</th>
                  <th>{t('leads:journey.customer')}</th>
                  <th>{t('common:fields.project')}</th>
                  <th>{t('leads:journey.leadStatus')}</th>
                  <th>{t('leads:journey.protectionExpiry')}</th>
                </tr>
              </thead>
              <tbody>
                {report.expiringSoon.map((r) => (
                  <tr key={r.registrationId}>
                    <td><Link to={`/registrations/${r.registrationId}`}>{r.registrationId}</Link></td>
                    <td>{r.customerName || '-'}</td>
                    <td>{r.projectId || '-'}</td>
                    <td>{statusLabel(r.currentStage) || '-'}</td>
                    <td>{formatDate(r.protectionExpiry, timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
