import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listDisputes } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';
import { errorMessage } from '../utils/errors';
import { enumLabel } from '../i18n/enumLabels';
import Pagination, { PageSizeSelect } from '../components/Pagination';

export const DISPUTE_STATUSES = ['OPEN', 'UPHELD', 'OVERTURNED', 'WITHDRAWN'];

// Badge colour per dispute status (reuses the existing badge classes).
export const disputeBadge = (status) => ({ OPEN: 'pending', UPHELD: 'accepted', OVERTURNED: 'rejected' }[status] || 'inactive');

// Ownership disputes (section 62): a partner whose registration was
// rejected as a duplicate disputes who owns the customer; an admin decides.
export default function Disputes() {
  const { timezone } = useAuth();
  const { t } = useTranslation(['registrations', 'common', 'enums']);
  const [disputes, setDisputes] = useState([]);
  // Open ones are the work queue, so that is what the page starts on.
  const [status, setStatus] = useState('OPEN');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    setError(null);
    listDisputes(status ? { status } : {})
      .then(({ data }) => { setDisputes(data.disputes); setPage(1); })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [status]);

  const totalPages = Math.max(1, Math.ceil(disputes.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = disputes.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="page page-wide">
      <h1>{t('registrations:disputes.title')}</h1>
      <p className="hint">{t('registrations:disputes.hint')}</p>
      {error && <div className="error-box">{error}</div>}

      <div className="toolbar">
        <div className="toolbar-right">
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('registrations:disputes.statusFilter')}>
            <option value="">{t('registrations:disputes.allStatuses')}</option>
            {DISPUTE_STATUSES.map((s) => <option key={s} value={s}>{enumLabel('disputeStatus', s)}</option>)}
          </select>
          <PageSizeSelect value={pageSize} onChange={(n) => { setPageSize(n); setPage(1); }} />
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="pro-table">
            <thead>
              <tr>{['dispute', 'customer', 'project', 'raisedBy', 'heldBy', 'status', 'raisedAt'].map((k) => <th key={k}>{t(`registrations:disputes.columns.${k}`)}</th>)}</tr>
            </thead>
            <tbody>
              {!loading && paged.map((d) => (
                <tr key={d.disputeId} className="clickable" onClick={() => navigate(`/disputes/${d.disputeId}`)}>
                  <td className="primary-cell">{d.disputeId}</td>
                  <td>{d.customer?.name}<div className="secondary-cell">{d.customer?.mobile}</div></td>
                  <td>{d.projectId || '-'}</td>
                  <td>{d.raisingPartnerName}<div className="secondary-cell">{d.partnerId}</div></td>
                  <td>{d.heldPartnerName}<div className="secondary-cell">{d.heldRegistrationId}</div></td>
                  <td><span className={`badge ${disputeBadge(d.status)}`}>{enumLabel('disputeStatus', d.status)}</span></td>
                  <td className="secondary-cell">{formatDateTime(d.createdAt, timezone)}</td>
                </tr>
              ))}
              {!loading && disputes.length === 0 && <tr><td colSpan={7} className="hint">{t('registrations:disputes.empty')}</td></tr>}
              {loading && <tr><td colSpan={7} className="hint">{t('common:states.loading')}</td></tr>}
            </tbody>
          </table>
        </div>

        {disputes.length > 0 && (
          <Pagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} total={disputes.length} setPage={setPage} />
        )}
      </div>
    </div>
  );
}
