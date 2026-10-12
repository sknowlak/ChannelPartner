import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../utils/timezone';
import { listBuilderProjects, listReferrals } from './builderClient';
import { REFERRAL_BADGE, REFERRAL_STATUSES, referralLabel } from './referralLabels';

// Column headers as translation keys - resolved at render time.
const COLUMNS = ['referral', 'customer', 'project', 'sourcePartner', 'status', 'booking', 'registered'];

// Referrals for this builder's own projects only - the server scopes the
// list; nothing here filters for security.
export default function BuilderReferrals() {
  const { t } = useTranslation(['builder', 'common']);
  const [projects, setProjects] = useState([]);
  const [filters, setFilters] = useState({ projectId: '', referralStatus: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listBuilderProjects().then(({ data: d }) => setProjects(d.projects)).catch((err) => setError(err.response?.data?.reason || err.message));
  }, []);
  useEffect(() => {
    const params = { limit: 200 };
    if (filters.projectId) params.projectId = filters.projectId;
    if (filters.referralStatus) params.referralStatus = filters.referralStatus;
    listReferrals(params).then(({ data: d }) => setData(d)).catch((err) => setError(err.response?.data?.reason || err.message));
  }, [filters]);

  return (
    <div className="page page-wide">
      <h1>{t('builder:list.title')}</h1>
      {error && <div className="error-box">{error}</div>}
      <div className="card">
        <div className="toolbar">
          <div className="toolbar-left">
            <select aria-label={t('common:fields.project')} value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">{t('builder:list.allProjects')}</option>
              {projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.name}</option>)}
            </select>
            <select aria-label={t('common:fields.status')} value={filters.referralStatus} onChange={(e) => setFilters((f) => ({ ...f, referralStatus: e.target.value }))}>
              <option value="">{t('builder:list.allStatuses')}</option>
              {REFERRAL_STATUSES.map((k) => <option key={k} value={k}>{referralLabel(t, k)}</option>)}
            </select>
          </div>
          {data && <span className="hint">{t('builder:list.count', { count: data.total })}</span>}
        </div>
        <div className="table-scroll">
          <table className="pro-table">
            <thead><tr>{COLUMNS.map((c) => <th key={c}>{t(`builder:list.columns.${c}`)}</th>)}</tr></thead>
            <tbody>
              {(data?.referrals || []).map((r) => (
                <tr key={r.registrationId}>
                  <td><Link to={`/builder/referrals/${r.registrationId}`}>{r.registrationId}</Link></td>
                  <td className="primary-cell">{r.customer || '-'}</td>
                  <td>{r.projectName}</td>
                  <td>{r.sourcePartner?.name}</td>
                  <td><span className={`badge ${REFERRAL_BADGE[r.referralStatus]}`}>{referralLabel(t, r.referralStatus)}</span></td>
                  <td>{r.isBooked ? t('builder:list.booked') : '-'}</td>
                  <td className="secondary-cell">{formatDate(r.registeredAt)}</td>
                </tr>
              ))}
              {data && data.referrals.length === 0 && <tr><td colSpan={COLUMNS.length} className="hint">{t('builder:list.empty')}</td></tr>}
            </tbody>
          </table>
        </div>
        {!data && !error && <p className="hint">{t('common:states.loading')}</p>}
      </div>
    </div>
  );
}
