import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listConnectors } from '../api/client';
import SettingsCategories from '../components/SettingsCategories';
import LinkedInMark from '../components/LinkedInMark';

// Settings -> Connectors (section 59): ad platforms a partner connects so
// their ad leads arrive in My Leads with spend and cost per lead.
export default function Connectors() {
  const { t } = useTranslation(['connectors', 'settings', 'common']);
  const [connectors, setConnectors] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listConnectors()
      .then(({ data }) => setConnectors(data.connectors))
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, []);

  const linkedin = connectors?.find((c) => c.key === 'linkedin');
  const statusClass = { CONNECTED: 'accepted', EXPIRED: 'rejected', ERROR: 'rejected' };

  return (
    <div className="page page-wide">
      <SettingsCategories />
      <h1>{t('connectors:page.title')}</h1>
      <p className="hint">{t('connectors:page.intro')}</p>
      {error && <div className="error-box">{error}</div>}
      {!connectors && !error && <p className="hint">{t('common:states.loading')}</p>}

      {linkedin && (
        <div className="connector-grid">
          <Link to="/settings/connectors/linkedin" className="card connector-card">
            <div className="connector-card-head">
              <LinkedInMark size={40} />
              <div>
                <strong>{t('connectors:catalog.linkedinName')}</strong>
                <span className={`badge ${statusClass[linkedin.status] || 'pending'}`}>{t(`connectors:status.${linkedin.status}`)}</span>
              </div>
            </div>
            <p className="hint">{t('connectors:catalog.linkedinDescription')}</p>
            <p className="connector-card-meta">
              {!linkedin.available && linkedin.status === 'NOT_CONNECTED'
                ? t('connectors:catalog.notAvailable')
                : linkedin.memberName
                  ? `${t('connectors:catalog.connectedAs', { name: linkedin.memberName })} · ${t('connectors:catalog.accounts', { count: linkedin.adAccounts })}`
                  : t('connectors:catalog.notConnected')}
            </p>
            <span className="connector-card-open">{t('connectors:catalog.open')} →</span>
          </Link>
        </div>
      )}
    </div>
  );
}
