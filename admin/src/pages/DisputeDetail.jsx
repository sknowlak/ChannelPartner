import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getDispute, resolveDispute } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';
import { errorMessage } from '../utils/errors';
import { enumLabel } from '../i18n/enumLabels';
import { disputeBadge } from './Disputes';

// One ownership dispute (section 62): the raising partner's claim next to
// the current holder's registration, and the admin's decision.
//   UPHELD     - the current owner keeps the customer;
//   OVERTURNED - the holder's protection ends and the customer is
//                registered for the raising partner.
export default function DisputeDetail() {
  const { disputeId } = useParams();
  const { timezone } = useAuth();
  const { t } = useTranslation(['registrations', 'common', 'enums']);
  const [dispute, setDispute] = useState(null);
  const [error, setError] = useState(null);
  // Set when the API refuses an overturn because the holder's lead is booked.
  const [heldBooked, setHeldBooked] = useState(false);
  const [note, setNote] = useState('');
  // The outcome waiting for confirmation (UPHELD | OVERTURNED), or null.
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getDispute(disputeId)
      .then(({ data }) => setDispute(data))
      .catch((err) => setError(errorMessage(err)));
  }, [disputeId]);

  const decide = async () => {
    setBusy(true);
    setError(null);
    setHeldBooked(false);
    try {
      const { data } = await resolveDispute(disputeId, { outcome: confirming, note: note.trim() });
      setDispute(data);
      setNote('');
    } catch (err) {
      setError(errorMessage(err));
      setHeldBooked(err?.response?.data?.code === 'HELD_BOOKED');
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  if (error && !dispute) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!dispute) return <div className="page">{t('common:states.loading')}</div>;

  const { customer, held, resolution } = dispute;
  const isOpen = dispute.status === 'OPEN';
  const heldLink = <Link to={`/registrations/${dispute.heldRegistrationId}`}>{dispute.heldRegistrationId}</Link>;

  return (
    <div className="page page-wide">
      <h1>{t('registrations:disputes.detail.title', { id: dispute.disputeId })}</h1>
      <p>
        <span className={`badge ${disputeBadge(dispute.status)}`}>{enumLabel('disputeStatus', dispute.status)}</span>{' '}
        <span className="hint">{t('registrations:disputes.detail.raisedOn', { date: formatDateTime(dispute.createdAt, timezone) })}</span>
      </p>
      {error && (
        <div className="error-box">
          {error}
          {heldBooked && <div>{t('registrations:disputes.detail.heldBookedHelp')} {heldLink}</div>}
        </div>
      )}

      <div className="side-by-side">
        <div className="card">
          <h3>{t('registrations:disputes.detail.raisingTitle')}</h3>
          <dl className="kv">
            <dt>{t('registrations:disputes.detail.partner')}</dt>
            <dd><Link to={`/partners/${dispute.partnerId}`}>{dispute.raisingPartnerName}</Link> <span className="secondary-cell">({dispute.partnerId})</span></dd>
            {dispute.raisedBy && <><dt>{t('registrations:disputes.detail.raisedBy')}</dt><dd>{dispute.raisedBy}</dd></>}
            <dt>{t('registrations:disputes.detail.customerName')}</dt><dd>{customer?.name || '-'}</dd>
            <dt>{t('registrations:disputes.detail.mobile')}</dt><dd>{customer?.mobile || '-'}</dd>
            {customer?.alternateMobile && <><dt>{t('registrations:disputes.detail.alternateMobile')}</dt><dd>{customer.alternateMobile}</dd></>}
            <dt>{t('registrations:disputes.detail.email')}</dt><dd>{customer?.email || '-'}</dd>
            <dt>{t('registrations:disputes.detail.project')}</dt><dd>{dispute.projectId || '-'}</dd>
          </dl>
          <h4>{t('registrations:disputes.detail.reason')}</h4>
          <p className="dispute-reason">{dispute.reason}</p>
        </div>

        <div className="card">
          <h3>{t('registrations:disputes.detail.holderTitle')}</h3>
          <dl className="kv">
            <dt>{t('registrations:disputes.detail.partner')}</dt>
            <dd><Link to={`/partners/${dispute.heldPartnerId}`}>{dispute.heldPartnerName}</Link> <span className="secondary-cell">({dispute.heldPartnerId})</span></dd>
            <dt>{t('registrations:disputes.detail.registration')}</dt><dd>{heldLink}</dd>
            {held && (
              <>
                <dt>{t('registrations:disputes.detail.registeredAt')}</dt><dd>{formatDateTime(held.registeredAt, timezone)}</dd>
                <dt>{t('registrations:detail.protectionExpiry')}</dt><dd>{formatDateTime(held.protectionExpiry, timezone)}</dd>
                <dt>{t('registrations:detail.currentStage')}</dt><dd>{held.currentStage || '-'}</dd>
                <dt>{t('registrations:disputes.detail.referral')}</dt><dd>{enumLabel('referralStatus', held.referralStatus) || '-'}</dd>
                <dt>{t('registrations:detail.booked')}</dt>
                <dd><span className={`badge ${held.isBooked ? 'accepted' : 'pending'}`}>{held.isBooked ? t('common:status.yes') : t('common:status.no')}</span></dd>
              </>
            )}
          </dl>
          {!held && <p className="hint">{t('registrations:disputes.detail.heldMissing')}</p>}
        </div>
      </div>

      {!isOpen && (
        <div className="card">
          <h3>{t('registrations:disputes.detail.resolutionTitle')}</h3>
          <dl className="kv">
            <dt>{t('registrations:disputes.detail.outcome')}</dt>
            <dd><span className={`badge ${disputeBadge(dispute.status)}`}>{enumLabel('disputeStatus', dispute.status)}</span></dd>
            {resolution?.note && <><dt>{t('registrations:disputes.detail.note')}</dt><dd>{resolution.note}</dd></>}
            {resolution?.by && <><dt>{t('registrations:disputes.detail.decidedBy')}</dt><dd>{resolution.by}</dd></>}
            {resolution?.at && <><dt>{t('registrations:disputes.detail.decidedAt')}</dt><dd>{formatDateTime(resolution.at, timezone)}</dd></>}
            {dispute.resultRegistrationId && (
              <><dt>{t('registrations:disputes.detail.newRegistration')}</dt><dd><Link to={`/registrations/${dispute.resultRegistrationId}`}>{dispute.resultRegistrationId}</Link></dd></>
            )}
          </dl>
        </div>
      )}

      {isOpen && (
        <div className="card">
          <h3>{t('registrations:disputes.detail.decideTitle')}</h3>
          <p className="hint">{t('registrations:detail.override.hint')}</p>
          <div className="field">
            <label htmlFor="dispute-note">{t('registrations:disputes.detail.noteLabel')}</label>
            <textarea id="dispute-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </div>
          <ul className="dispute-outcomes">
            <li><strong>{t('registrations:disputes.detail.uphold')}</strong> - {t('registrations:disputes.detail.upholdEffect', { holder: dispute.heldPartnerName })}</li>
            <li><strong>{t('registrations:disputes.detail.overturn')}</strong> - {t('registrations:disputes.detail.overturnEffect', { holder: dispute.heldPartnerName, partner: dispute.raisingPartnerName })}</li>
          </ul>
          {held?.isBooked && <div className="warn-box">{t('registrations:disputes.detail.heldBookedHelp')} {heldLink}</div>}

          {!confirming ? (
            <div className="button-row">
              <button className="primary" disabled={!note.trim()} onClick={() => setConfirming('UPHELD')}>{t('registrations:disputes.detail.uphold')}</button>
              <button className="danger" disabled={!note.trim() || held?.isBooked} onClick={() => setConfirming('OVERTURNED')}>{t('registrations:disputes.detail.overturn')}</button>
              {!note.trim() && <span className="hint">{t('registrations:disputes.detail.noteRequired')}</span>}
            </div>
          ) : (
            <div className="warn-box" role="alertdialog" aria-label={t('registrations:disputes.detail.confirmTitle')}>
              <p><strong>{t('registrations:disputes.detail.confirmTitle')}</strong></p>
              <p>
                {confirming === 'UPHELD'
                  ? t('registrations:disputes.detail.upholdEffect', { holder: dispute.heldPartnerName })
                  : t('registrations:disputes.detail.overturnEffect', { holder: dispute.heldPartnerName, partner: dispute.raisingPartnerName })}
              </p>
              <div className="button-row">
                <button className={confirming === 'UPHELD' ? 'primary' : 'danger'} disabled={busy} onClick={decide}>
                  {busy ? t('registrations:detail.override.applying') : t(`registrations:disputes.detail.${confirming === 'UPHELD' ? 'confirmUphold' : 'confirmOverturn'}`)}
                </button>
                <button className="secondary" disabled={busy} onClick={() => setConfirming(null)}>{t('common:actions.cancel')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      <Link to="/disputes"><button className="secondary">{t('registrations:disputes.detail.back')}</button></Link>
    </div>
  );
}
