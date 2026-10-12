import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDashboard } from '../api/client';
import { formatNumber } from '../i18n/format';
import { errorMessage } from '../utils/errors';

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
  'totalCommissionEligible'
];

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

  return (
    <div className="page">
      <h1>{t('dashboard:title')}</h1>
      <div className="stat-grid">
        {TILES.map((key) => (
          <div className="stat-tile" key={key}>
            <div className="value">{formatNumber(summary[key])}</div>
            <div className="label">{t(`dashboard:tiles.${key}`)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
