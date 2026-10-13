import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listLinkedInActivity } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';
import { formatNumber } from '../i18n/format';
import { pageWindow } from '../utils/pageWindow';

// LinkedIn activity log (section 59): connections, syncs, each lead and its
// outcome, conversions, real-time notifications and errors - filterable.
const PAGE_SIZE = 20;
const LEVEL_CLASS = { INFO: 'accepted', WARNING: 'pending', ERROR: 'rejected' };

export default function LinkedInActivityLog({ types, refreshKey }) {
  const { t } = useTranslation(['connectors', 'common']);
  const { partner } = useAuth();
  const [type, setType] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    listLinkedInActivity({ type: type || undefined, level: level || undefined, page, pageSize: PAGE_SIZE })
      .then(({ data }) => setResult(data))
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, [type, level, page]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { setPage(1); }, [type, level]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <div className="card">
      <div className="li-section-head">
        <h3>{t('activity.title')}</h3>
        <div className="li-filters">
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('activity.event')}>
            <option value="">{t('activity.allTypes')}</option>
            {types.map((x) => <option key={x} value={x}>{t(`activity.types.${x}`)}</option>)}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label={t('activity.allLevels')}>
            <option value="">{t('activity.allLevels')}</option>
            {['INFO', 'WARNING', 'ERROR'].map((x) => <option key={x} value={x}>{t(`activity.levels.${x}`)}</option>)}
          </select>
          <button type="button" className="secondary" onClick={load}>{t('activity.refresh')}</button>
        </div>
      </div>
      <p className="hint">{t('activity.intro')}</p>
      {error && <div className="error-box">{error}</div>}
      {result && result.items.length === 0 && <p className="hint">{t('activity.empty')}</p>}
      {result && result.items.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="pro-table li-activity">
              <thead>
                <tr><th>{t('activity.time')}</th><th>{t('activity.event')}</th><th>{t('activity.details')}</th><th>{t('activity.lead')}</th></tr>
              </thead>
              <tbody>
                {result.items.map((a) => (
                  <tr key={a.activityId}>
                    <td className="secondary-cell">{formatDateTime(a.createdAt, partner?.timezone)}</td>
                    <td><span className={`badge ${LEVEL_CLASS[a.level]}`}>{t(`activity.types.${a.type}`)}</span></td>
                    <td className="li-activity-message" title={a.message}>{a.message}{a.actor ? <span className="secondary-cell"> · {a.actor}</span> : null}</td>
                    <td>{a.registrationId ? <Link to={`/registrations/${a.registrationId}`}>{a.registrationId}</Link> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination-bar">
            <span className="hint">
              {t('activity.showing', {
                from: formatNumber((page - 1) * PAGE_SIZE + 1),
                to: formatNumber(Math.min(page * PAGE_SIZE, result.total)),
                total: formatNumber(result.total)
              })}
            </span>
            <div className="pagination-buttons">
              <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t('common:actions.previous')}>&lsaquo;</button>
              {pageWindow(page, totalPages).map((p, i) => (p === 'gap'
                ? <span key={`gap-${i}`} className="page-gap" aria-hidden="true">&hellip;</span>
                : <button key={p} className={`page-btn ${p === page ? 'current' : ''}`} aria-current={p === page ? 'page' : undefined} onClick={() => setPage(p)}>{formatNumber(p)}</button>
              ))}
              <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label={t('common:actions.next')}>&rsaquo;</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
