import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listMyDisputes, withdrawDispute } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';
import { PERMISSIONS } from '../utils/permissions';

// Ownership disputes this partner raised (section 62): a customer they were
// refused as a duplicate, sent to a Leadrat admin for review. The holder is
// never named here - only what this partner entered and the outcome.
const DISPUTE_BADGE = { OPEN: 'pending', UPHELD: 'rejected', OVERTURNED: 'accepted', WITHDRAWN: 'neutral' };
const DISPUTE_STATUSES = new Set(Object.keys(DISPUTE_BADGE));

function DisputeStatusBadge({ status }) {
  const { t } = useTranslation('leads');
  return (
    <span className={`badge ${DISPUTE_BADGE[status] || 'pending'}`}>
      {DISPUTE_STATUSES.has(status) ? t(`disputes.status.${status}`) : status}
    </span>
  );
}

export default function MyDisputes() {
  const { t } = useTranslation(['leads', 'common']);
  const { partner, hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.MANAGE_LEADS);
  const [disputes, setDisputes] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => listMyDisputes()
    .then(({ data }) => setDisputes(data.disputes))
    .catch((err) => setError(err.response?.data?.reason || err.message));

  useEffect(() => { load(); }, []);

  const withdraw = async (dispute) => {
    if (!window.confirm(t('leads:disputes.withdrawConfirm', { name: dispute.customerName }))) return;
    setBusyId(dispute.disputeId);
    setError(null);
    try {
      await withdrawDispute(dispute.disputeId);
      await load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!disputes) {
    return <div className="page page-wide">{error ? <div className="error-box">{error}</div> : t('common:states.loading')}</div>;
  }

  return (
    <div className="page page-wide">
      <h1>{t('leads:disputes.title')}</h1>
      <p className="hint">{t('leads:disputes.intro')}</p>
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        {disputes.length === 0 ? (
          <p className="hint">{t('leads:disputes.empty')}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('leads:disputes.columns.dispute')}</th>
                  <th>{t('leads:journey.customer')}</th>
                  <th>{t('common:fields.project')}</th>
                  <th>{t('leads:disputes.columns.reason')}</th>
                  <th>{t('common:fields.status')}</th>
                  <th>{t('leads:disputes.columns.outcome')}</th>
                  {canManage && <th>{t('common:fields.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => (
                  <tr key={d.disputeId}>
                    <td>
                      {d.disputeId}
                      <div className="hint">{formatDateTime(d.createdAt, partner.timezone)}{d.raisedBy ? ` · ${d.raisedBy}` : ''}</div>
                    </td>
                    <td>{d.customerName}<div className="hint">{d.customerMobile}</div></td>
                    <td>{d.projectId || '-'}</td>
                    <td className="dispute-reason">{d.reason}</td>
                    <td><DisputeStatusBadge status={d.status} /></td>
                    <td>
                      {d.resolution ? (
                        <>
                          <div className="dispute-reason">{d.resolution.note}</div>
                          <div className="hint">{formatDateTime(d.resolution.at, partner.timezone)}</div>
                        </>
                      ) : <span className="hint">{t('leads:disputes.awaitingReview')}</span>}
                      {d.resultRegistrationId && (
                        <div><Link to={`/registrations/${d.resultRegistrationId}`}>{t('leads:disputes.openNewLead', { id: d.resultRegistrationId })}</Link></div>
                      )}
                    </td>
                    {canManage && (
                      <td>
                        {d.status === 'OPEN' && (
                          <button className="secondary" disabled={busyId === d.disputeId} onClick={() => withdraw(d)}>{t('leads:disputes.withdraw')}</button>
                        )}
                      </td>
                    )}
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
