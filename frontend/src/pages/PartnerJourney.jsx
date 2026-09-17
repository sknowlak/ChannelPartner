import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createMyBooking, getMyRegistration, getMyRegistrationAudit, updateMyProgress } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime } from '../utils/timezone';

const STAGES = ['Registered', 'Contacted', 'Qualified', 'Site Visit', 'Negotiation', 'Booking'];

// Ownership-enforced version of the partner journey screen - fetches/updates
// through /my/registrations/:id, so this only ever works for leads owned by
// the logged-in partner (spec section 31).
export default function PartnerJourney() {
  const { registrationId } = useParams();
  const navigate = useNavigate();
  const { partner } = useAuth();
  const [detail, setDetail] = useState(null);
  const [events, setEvents] = useState([]);
  const [nextStage, setNextStage] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [{ data: d }, { data: audit }] = await Promise.all([
        getMyRegistration(registrationId),
        getMyRegistrationAudit(registrationId)
      ]);
      setDetail(d);
      setEvents(audit.events);
      setNextStage(d.registration.currentStage);
    } catch (err) {
      setError(err.response ? err.response.data.reason : err.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationId]);

  const handleProgress = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateMyProgress(registrationId, { stage: nextStage });
      await load();
    } catch (err) {
      setError(err.response ? err.response.data.reason : err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleBooking = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await createMyBooking(registrationId, {});
      navigate(`/registrations/${registrationId}/booking`, { state: { booking: data } });
    } catch (err) {
      setError(err.response ? err.response.data.reason : err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!detail) return <div className="page">Loading...</div>;

  const { registration, customer, ownership } = detail;

  return (
    <div className="page">
      <h1>{registrationId}</h1>
      <div className="card">
        <dl className="kv">
          <dt>Customer</dt>
          <dd>{customer.name} ({customer.mobile})</dd>
          <dt>Project</dt>
          <dd>{registration.projectId}</dd>
          <dt>Current Owner</dt>
          <dd>{ownership ? ownership.workingOwner : registration.partnerId}</dd>
          <dt>Protection Expiry</dt>
          <dd>{formatDate(registration.protectionExpiry, partner.timezone)}</dd>
          <dt>Lead Stage</dt>
          <dd>{registration.currentStage}</dd>
        </dl>

        {!registration.isBooked && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <select value={nextStage} onChange={(e) => setNextStage(e.target.value)}>
              {STAGES.filter((s) => s !== 'Booking').map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button className="secondary" disabled={busy} onClick={handleProgress}>Add Progress</button>
            <button className="primary" disabled={busy} onClick={handleBooking}>Complete Booking</button>
          </div>
        )}
        {registration.isBooked && <p className="hint">This registration has already been booked and handed over.</p>}
      </div>

      <div className="card">
        <h3>Progress History <span className="hint">(times in {partner.timezone})</span></h3>
        <ul className="timeline">
          {events.map((ev) => (
            <li key={ev.auditId}>
              <div className="ts">{formatDateTime(ev.timestamp, partner.timezone)}</div>
              <div>{ev.description}</div>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <Link to="/my-leads"><button className="secondary">Back to My Leads</button></Link>
        <Link to={`/registrations/${registrationId}/builder`}><button className="secondary">Builder View</button></Link>
      </div>
    </div>
  );
}
