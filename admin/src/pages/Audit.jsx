import { useEffect, useState } from 'react';
import { listAudit } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';

export default function Audit() {
  const { timezone } = useAuth();
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ registrationId: '', eventType: '', actor: '' });
  const [error, setError] = useState(null);

  const load = () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    listAudit(params)
      .then(({ data }) => {
        setEvents(data.events);
        setTotal(data.total);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  useEffect(load, []);

  return (
    <div className="page">
      <h1>Global Audit Feed</h1>
      <p className="hint">Every cross-company action across every partner and registration. Times shown in {timezone}.</p>
      {error && <div className="error-box">{error}</div>}

      <div className="filters">
        <input placeholder="Registration ID" value={filters.registrationId} onChange={(e) => setFilters((f) => ({ ...f, registrationId: e.target.value }))} />
        <input placeholder="Event Type" value={filters.eventType} onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value }))} />
        <input placeholder="Actor" value={filters.actor} onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))} />
        <button className="secondary" onClick={load}>Apply Filters</button>
      </div>

      <div className="card">
        <p className="hint">{total} total events</p>
        <ul className="timeline">
          {events.map((ev) => (
            <li key={ev.auditId}>
              <div className="ts">{formatDateTime(ev.timestamp, timezone)} — {ev.registrationId} — {ev.actor}</div>
              <div><strong>{ev.eventType}</strong>: {ev.description}</div>
            </li>
          ))}
          {events.length === 0 && <p className="hint">No audit events match these filters.</p>}
        </ul>
      </div>
    </div>
  );
}
