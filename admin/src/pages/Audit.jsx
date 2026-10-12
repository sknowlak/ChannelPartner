import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listAudit } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';
import { errorMessage } from '../utils/errors';

export default function Audit() {
  const { timezone } = useAuth();
  const { t } = useTranslation(['audit', 'common']);
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
      .catch((err) => setError(errorMessage(err)));
  };

  useEffect(load, []);

  return (
    <div className="page">
      <h1>{t('audit:title')}</h1>
      <p className="hint">{t('audit:hint', { timezone })}</p>
      {error && <div className="error-box">{error}</div>}

      <div className="filters">
        <input placeholder={t('audit:filters.registrationId')} aria-label={t('audit:filters.registrationId')} value={filters.registrationId} onChange={(e) => setFilters((f) => ({ ...f, registrationId: e.target.value }))} />
        <input placeholder={t('audit:filters.eventType')} aria-label={t('audit:filters.eventType')} value={filters.eventType} onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value }))} />
        <input placeholder={t('audit:filters.actor')} aria-label={t('audit:filters.actor')} value={filters.actor} onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))} />
        <button className="secondary" onClick={load}>{t('audit:filters.apply')}</button>
      </div>

      <div className="card">
        <p className="hint">{t('audit:total', { count: total })}</p>
        <ul className="timeline">
          {/* Event types (LEAD_CREATED...) and descriptions are server data, shown as stored. */}
          {events.map((ev) => (
            <li key={ev.auditId}>
              <div className="ts">{formatDateTime(ev.timestamp, timezone)} — {ev.registrationId} — {ev.actor}</div>
              <div><strong>{ev.eventType}</strong>: {ev.description}</div>
            </li>
          ))}
          {events.length === 0 && <p className="hint">{t('audit:empty')}</p>}
        </ul>
      </div>
    </div>
  );
}
