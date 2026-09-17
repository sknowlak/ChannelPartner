import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getRegistration, getRegistrationAudit, overrideRegistration } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';

export default function RegistrationDetail() {
  const { registrationId } = useParams();
  const { timezone } = useAuth();
  const [detail, setDetail] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ action: 'RELEASE_PROTECTION', newPartnerId: '', reason: '' });

  const load = () => {
    Promise.all([getRegistration(registrationId), getRegistrationAudit(registrationId)])
      .then(([{ data: d }, { data: a }]) => {
        setDetail(d);
        setEvents(a.events);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  useEffect(load, [registrationId]);

  const handleOverride = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await overrideRegistration(registrationId, overrideForm);
      setOverrideForm((f) => ({ ...f, reason: '' }));
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!detail) return <div className="page">Loading...</div>;

  const { registration, customer, ownership, booking, commission } = detail;

  return (
    <div className="page">
      <h1>{registrationId}</h1>

      <div className="card">
        <h3>Registration</h3>
        <dl className="kv">
          <dt>Customer</dt><dd>{customer?.name} ({customer?.mobile}{customer?.email ? `, ${customer.email}` : ''})</dd>
          <dt>Partner</dt><dd>{registration.partnerId}</dd>
          <dt>Project</dt><dd>{registration.projectId}</dd>
          <dt>Status</dt><dd><span className={`badge ${registration.status.toLowerCase()}`}>{registration.status}</span></dd>
          <dt>Current Stage</dt><dd>{registration.currentStage}</dd>
          <dt>Protection Expiry</dt><dd>{formatDateTime(registration.protectionExpiry, timezone)}</dd>
          <dt>Booked</dt><dd>{registration.isBooked ? 'Yes' : 'No'}</dd>
          <dt>Working Owner</dt><dd>{ownership?.workingOwner}</dd>
          <dt>Operational Owner</dt><dd>{ownership?.operationalOwner}</dd>
          {booking && <><dt>Booking ID</dt><dd>{booking.bookingId}</dd></>}
          {commission && <><dt>Commission Eligibility</dt><dd><span className="badge eligible">{commission.eligibilityStatus}</span></dd></>}
        </dl>
      </div>

      <div className="card">
        <h3>Admin Override</h3>
        <p className="hint">Overrides are always logged with your admin identity and reason - never silent.</p>
        <form onSubmit={handleOverride}>
          <div className="field">
            <label>Action</label>
            <select value={overrideForm.action} onChange={(e) => setOverrideForm((f) => ({ ...f, action: e.target.value }))}>
              <option value="RELEASE_PROTECTION">Release duplicate protection early</option>
              <option value="REASSIGN_PARTNER">Reassign to another partner</option>
            </select>
          </div>
          {overrideForm.action === 'REASSIGN_PARTNER' && (
            <div className="field">
              <label>New Partner ID</label>
              <input value={overrideForm.newPartnerId} onChange={(e) => setOverrideForm((f) => ({ ...f, newPartnerId: e.target.value }))} required />
            </div>
          )}
          <div className="field">
            <label>Reason (required)</label>
            <input value={overrideForm.reason} onChange={(e) => setOverrideForm((f) => ({ ...f, reason: e.target.value }))} required />
          </div>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Applying...' : 'Apply Override'}</button>
        </form>
      </div>

      <div className="card">
        <h3>Audit Timeline (this registration)</h3>
        <ul className="timeline">
          {events.map((ev) => (
            <li key={ev.auditId}>
              <div className="ts">{formatDateTime(ev.timestamp, timezone)} — {ev.actor}</div>
              <div>{ev.description}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
