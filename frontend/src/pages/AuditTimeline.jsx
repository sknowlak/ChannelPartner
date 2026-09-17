import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getAuditTimeline } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';

export default function AuditTimeline() {
  const { registrationId } = useParams();
  const { partner } = useAuth();
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    getAuditTimeline(registrationId)
      .then(({ data }) => setEvents(data.events))
      .catch((err) => setError(err.response ? err.response.data.reason : err.message));
  }, [registrationId]);

  if (error) return <div className="page"><div className="error-box">{error}</div></div>;

  return (
    <div className="page">
      <h1>Screen 6 — Audit Timeline</h1>
      <div className="card">
        <ul className="timeline">
          {events.map((ev) => (
            <li key={ev.auditId}>
              <div className="ts">{formatDateTime(ev.timestamp, partner?.timezone)} — {ev.actor}</div>
              <div>{ev.description}</div>
            </li>
          ))}
          {events.length === 0 && <p className="hint">No audit events yet.</p>}
        </ul>
      </div>
    </div>
  );
}
