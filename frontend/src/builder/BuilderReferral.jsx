import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { bookReferral, decideReferral, getReferral, getReferralAudit } from './builderClient';
import { REFERRAL_BADGE, REFERRAL_LABEL } from './referralLabels';

// One referral: what the builder may see (field sharing), accept/reject,
// confirm the booking, and the organization-level history.
export default function BuilderReferral() {
  const { registrationId } = useParams();
  const [ref, setRef] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
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
    const ok = window.confirm('Confirm the booking? Operational ownership moves to you and the partner becomes eligible for commission.');
    if (ok) act(() => bookReferral(registrationId), 'Booking confirmed.');
  };

  if (error && !ref) return <div className="page"><div className="error-box">{error}</div><Link to="/builder/referrals">Back</Link></div>;
  if (!ref) return <div className="page">Loading...</div>;
  const show = (v) => (v === undefined || v === null || v === '' ? <span className="hint">Shared after booking</span> : v);

  return (
    <div className="page page-wide">
      <h1>{ref.registrationId}</h1>
      {error && <div className="error-box">{error}</div>}
      {notice && <div className="info-box">{notice}</div>}
      <div className="card">
        <dl className="kv">
          <dt>Customer</dt><dd>{show(ref.customer)}</dd>
          <dt>Mobile</dt><dd>{show(ref.mobile)}</dd>
          <dt>Email</dt><dd>{show(ref.email)}</dd>
          <dt>Project</dt><dd>{ref.projectName}</dd>
          <dt>Source Partner</dt><dd>{ref.sourcePartner?.name} <span className="hint">(attribution - cannot be changed)</span></dd>
          <dt>Lead Status</dt><dd>{show(ref.currentStage)}</dd>
          <dt>Protected Until</dt><dd>{new Date(ref.protectionUntil).toLocaleDateString()}</dd>
          <dt>Referral</dt>
          <dd>
            <span className={`badge ${REFERRAL_BADGE[ref.referralStatus]}`}>{REFERRAL_LABEL[ref.referralStatus]}</span>
            {ref.referralDecision?.reason && <div className="hint">Reason: {ref.referralDecision.reason}</div>}
          </dd>
          <dt>Booking</dt><dd>{ref.isBooked ? 'Booked - you are the operational owner' : 'Not booked'}</dd>
        </dl>

        {!ref.isBooked && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            {ref.referralStatus !== 'ACCEPTED' && (
              <button className="primary" disabled={busy} onClick={() => act(() => decideReferral(registrationId, 'ACCEPT'), 'Referral accepted.')}>Accept Referral</button>
            )}
            {ref.referralStatus === 'ACCEPTED' && (
              <button className="primary" disabled={busy} onClick={confirmBooking}>Confirm Booking</button>
            )}
            {ref.referralStatus !== 'REJECTED' && !rejecting && (
              <button className="danger" disabled={busy} onClick={() => setRejecting(true)}>Reject Referral</button>
            )}
          </div>
        )}
        {rejecting && (
          <div className="field" style={{ marginTop: '0.8rem' }}>
            <label>Reason for rejecting (shown to the partner) *</label>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
              <button className="danger" disabled={busy || !reason.trim()} onClick={() => act(() => decideReferral(registrationId, 'REJECT', reason), 'Referral rejected.')}>Reject</button>
              <button className="secondary" onClick={() => setRejecting(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>History</h3>
        <ul className="timeline">
          {events.map((ev, i) => (
            <li key={i}>
              <div className="ts">{new Date(ev.timestamp).toLocaleString()} · {ev.actor}</div>
              <div>{ev.description}</div>
            </li>
          ))}
        </ul>
      </div>
      <Link to="/builder/referrals"><button className="secondary">Back to Referrals</button></Link>
    </div>
  );
}
