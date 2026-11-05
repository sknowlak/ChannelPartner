import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getDashboard } from '../api/client';
import { formatNumber } from '../i18n/format';
import { errorMessage } from '../utils/errors';
import { formatDate, formatDayMonth } from '../utils/timezone';

// Labels are translation keys (dashboard:tiles.<key>), resolved at render
// time so they follow a language switch.
const TILES = [
  'totalPartners',
  'activePartners',
  'totalRegistrations',
  'acceptedRegistrations',
  'rejectedRegistrations',
  'pendingBookings',
  'totalBookings',
  'totalCommissionEligible',
  'cancelledBookings'
];

const TREND_DAYS = 30;

// The API sends only days that had registrations (UTC dates); the chart
// shows every one of the last 30 days, with 0 for the empty ones.
function fillTrend(trend) {
  const counts = new Map((trend || []).map((d) => [d.date, d.count]));
  const today = new Date();
  const days = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const date = day.toISOString().slice(0, 10);
    days.push({ date, count: counts.get(date) || 0 });
  }
  return days;
}

export default function Dashboard() {
  const { t } = useTranslation(['dashboard', 'common']);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getDashboard()
      .then(({ data }) => setSummary(data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!summary) return <div className="page">{t('common:states.loading')}</div>;

  const trend = fillTrend(summary.registrationTrend);
  const trendTotal = trend.reduce((sum, d) => sum + d.count, 0);
  const trendMax = Math.max(1, ...trend.map((d) => d.count));
  const leaderboard = summary.leaderboard || [];

  return (
    <div className="page">
      <h1>{t('dashboard:title')}</h1>
      <div className="stat-grid">
        {/* Open disputes need an admin decision - the tile leads to them. */}
        <Link to="/disputes" className={`stat-tile stat-link${summary.openDisputes ? ' attention' : ''}`}>
          <div className="value">{formatNumber(summary.openDisputes)}</div>
          <div className="label">{t('dashboard:tiles.openDisputes')}</div>
        </Link>
        {TILES.map((key) => (
          <div className="stat-tile" key={key}>
            <div className="value">{formatNumber(summary[key])}</div>
            <div className="label">{t(`dashboard:tiles.${key}`)}</div>
          </div>
        ))}
      </div>

      <div className="card dashboard-section">
        <h3>{t('dashboard:trend.title')}</h3>
        <p className="hint">{t('dashboard:trend.hint', { count: trendTotal })}</p>
        <div className="bar-chart" role="img" aria-label={t('dashboard:trend.chartLabel', { count: trendTotal })}>
          {trend.map((d) => (
            <div className="bar-col" key={d.date} title={t('dashboard:trend.barTitle', { date: formatDate(d.date, 'UTC'), count: d.count })}>
              <div className="bar" style={{ height: `${(d.count / trendMax) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="bar-chart-axis" aria-hidden="true">
          <span>{formatDayMonth(trend[0].date, 'UTC')}</span>
          <span>{formatDayMonth(trend[Math.floor(TREND_DAYS / 2)].date, 'UTC')}</span>
          <span>{formatDayMonth(trend[TREND_DAYS - 1].date, 'UTC')}</span>
        </div>
      </div>

      <div className="card dashboard-section">
        <h3>{t('dashboard:leaderboard.title')}</h3>
        <p className="hint">{t('dashboard:leaderboard.hint')}</p>
        <div className="table-scroll">
          <table className="pro-table">
            <thead>
              <tr>{['rank', 'partner', 'leads', 'accepted', 'booked', 'conversion'].map((k) => <th key={k}>{t(`dashboard:leaderboard.columns.${k}`)}</th>)}</tr>
            </thead>
            <tbody>
              {leaderboard.map((p, i) => (
                <tr key={p.partnerId}>
                  <td>{formatNumber(i + 1)}</td>
                  <td className="primary-cell"><Link to={`/partners/${p.partnerId}`}>{p.name}</Link><div className="secondary-cell">{p.partnerId}</div></td>
                  <td>{formatNumber(p.leads)}</td>
                  <td>{formatNumber(p.accepted)}</td>
                  <td>{formatNumber(p.booked)}</td>
                  <td>{formatNumber(p.conversionRate / 100, { style: 'percent', maximumFractionDigits: 1 })}</td>
                </tr>
              ))}
              {leaderboard.length === 0 && <tr><td colSpan={6} className="hint">{t('dashboard:leaderboard.empty')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
