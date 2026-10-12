import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { statusLabel } from '../i18n/dataLabels';
import { formatDate, formatDateTime } from '../utils/timezone';
import { bookReferral, decideReferral, getReferral, getReferralAudit } from './builderClient';
import { REFERRAL_BADGE, actorLabel, describeEvent, referralLabel } from './referralLabels';

// One referral: what the builder may see (field sharing), accept/reject,
// confirm the booking, and the organization-level history.
export default function BuilderReferral() {
  const { t } = useTranslation(['builder', 'common', 'data']);
  const { registrationId } = useParams();
  const [ref, setRef] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  // Holds a translation key so the notice follows a language switch.
  const [notice, setNotice] = useState(null);

  const load = async () => {
    try {
      const [{ data: r }, { data: a }] = await Promise.all([getReferral(registrationId), getReferralAudit(registrationId)]);
      setRef(r);
      setEvents(a.events);
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [registrationId]);

  const act = async (fn, done) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(done);
      setRejecting(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmBooking = () => {
    const ok = window.confirm(t('builder:detail.confirmBookingPrompt'));
    if (ok) act(() => bookReferral(registrationId), 'builder:detail.notice.booked');
  };

  if (error && !ref) return <div className="page"><div className="error-box">{error}</div><Link to="/builder/referrals">{t('common:actions.back')}</Link></div>;
  if (!ref) return <div className="page">{t('common:states.loading')}</div>;
  const show = (v) => (v === undefined || v === null || v === '' ? <span className="hint">{t('builder:detail.sharedAfterBooking')}</span> : v); // i18n-ignore: arrow function, not UI text

  return (
    <div className="page page-wide">
      <h1>{ref.registrationId}</h1>
      {error && <div className="error-box">{error}</div>}
      {notice && <div className="info-box">{t(notice)}</div>}
      <div className="card">
        <dl className="kv">
          <dt>{t('builder:detail.customer')}</dt><dd>{show(ref.customer)}</dd>
          <dt>{t('common:fields.mobile')}</dt><dd>{show(ref.mobile)}</dd>
          <dt>{t('common:fields.email')}</dt><dd>{show(ref.email)}</dd>
          <dt>{t('common:fields.project')}</dt><dd>{ref.projectName}</dd>
          <dt>{t('builder:detail.sourcePartner')}</dt><dd>{ref.sourcePartner?.name} <span className="hint">{t('builder:detail.attributionNote')}</span></dd>
          <dt>{t('builder:detail.leadStatus')}</dt><dd>{show(ref.currentStage ? statusLabel(ref.currentStage) : ref.currentStage)}</dd>
          <dt>{t('builder:detail.protectedUntil')}</dt><dd>{formatDate(ref.protectionUntil)}</dd>
          <dt>{t('builder:detail.referral')}</dt>
          <dd>
            <span className={`badge ${REFERRAL_BADGE[ref.referralStatus]}`}>{referralLabel(t, ref.referralStatus)}</span>
            {ref.referralDecision?.reason && <div className="hint">{t('builder:detail.reason', { reason: ref.referralDecision.reason })}</div>}
          </dd>
          <dt>{t('builder:detail.booking')}</dt><dd>{ref.isBooked ? t('builder:detail.bookedOwner') : t('builder:detail.notBooked')}</dd>
        </dl>

        {!ref.isBooked && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            {ref.referralStatus !== 'ACCEPTED' && (
              <button className="primary" disabled={busy} onClick={() => act(() => decideReferral(registrationId, 'ACCEPT'), 'builder:detail.notice.accepted')}>{t('builder:detail.accept')}</button>
            )}
            {ref.referralStatus === 'ACCEPTED' && (
              <button className="primary" disabled={busy} onClick={confirmBooking}>{t('builder:detail.confirmBooking')}</button>
            )}
            {ref.referralStatus !== 'REJECTED' && !rejecting && (
              <button className="danger" disabled={busy} onClick={() => setRejecting(true)}>{t('builder:detail.reject')}</button>
            )}
          </div>
        )}
        {rejecting && (
          <div className="field" style={{ marginTop: '0.8rem' }}>
            <label htmlFor="builder-reject-reason">{t('builder:detail.rejectReasonLabel')}</label>
            <textarea id="builder-reject-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
              <button className="danger" disabled={busy || !reason.trim()} onClick={() => act(() => decideReferral(registrationId, 'REJECT', reason), 'builder:detail.notice.rejected')}>{t('builder:detail.rejectConfirm')}</button>
              <button className="secondary" onClick={() => setRejecting(false)}>{t('common:actions.cancel')}</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('builder:history.title')}</h3>
        <ul className="timeline">
          {events.map((ev, i) => (
            <li key={i}>
              <div className="ts">{formatDateTime(ev.timestamp)} · {actorLabel(t, ev.actor)}</div>
              <div>{describeEvent(t, ev)}</div>
            </li>
          ))}
        </ul>
      </div>
      <Link to="/builder/referrals"><button className="secondary">{t('builder:detail.backToReferrals')}</button></Link>
    </div>
  );
}
