import { useEffect, useState } from 'react';
import { getMyRegistrationAudit } from '../api/client';
import { dayLabel, formatDateTime, formatTime } from '../utils/timezone';

const CATEGORY_TABS = [
  { key: 'all', label: 'All' },
  { key: 'status', label: 'Status' },
  { key: 'assignment', label: 'Assignment' },
  { key: 'notes', label: 'Notes' }
];

const STATUS_EVENT_TYPES = new Set([
  'STAGE_UPDATED', 'REGISTRATION_ACCEPTED', 'REGISTRATION_ATTEMPT_REJECTED', 'BOOKING_COMPLETED', 'HANDOVER_COMPLETED'
]);
const ASSIGNMENT_EVENT_TYPES = new Set(['LEAD_ASSIGNED', 'OPERATIONAL_OWNERSHIP_TRANSFERRED', 'PARTNER_ATTRIBUTION_PRESERVED']);

function matchesCategory(ev, category) {
  if (category === 'all') return true;
  if (category === 'status') return STATUS_EVENT_TYPES.has(ev.eventType);
  if (category === 'assignment') return ASSIGNMENT_EVENT_TYPES.has(ev.eventType);
  if (category === 'notes') return (ev.newValue?.changes || []).some((c) => c.fieldKey === 'notes');
  return true;
}

// Schedule changes (section 49) are stored as ISO timestamps.
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function formatChangeValue(value, timezone) {
  if (value === undefined || value === null || value === '') return '(empty)';
  if (typeof value === 'string' && ISO_DATE_TIME.test(value)) return formatDateTime(value, timezone);
  if (Array.isArray(value)) return value.join(', ') || '(empty)';
  return String(value);
}

// A change entry is either {fieldKey,label,value} (set at creation - always
// "added") or {fieldKey,label,from,to} (an edit - "added" if it had no
// previous value, "updated" otherwise).
function ChangeLine({ change, timezone }) {
  if (change.value !== undefined) {
    return (
      <li>
        <strong>{change.label}</strong> <span className="history-verb">added</span>
        <span className="history-arrow">→</span>
        <span className="history-value">{formatChangeValue(change.value, timezone)}</span>
      </li>
    );
  }
  const hadPrevious = change.from !== undefined && change.from !== null && change.from !== '';
  return (
    <li>
      <strong>{change.label}</strong> <span className="history-verb">{hadPrevious ? 'updated' : 'added'}</span>
      <span className="history-arrow">→</span>
      <span className="history-value">{formatChangeValue(change.to, timezone)}</span>
    </li>
  );
}

function groupByDay(events, timezone) {
  const groups = [];
  for (const ev of events) {
    const label = dayLabel(ev.timestamp, timezone);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.events.push(ev);
    else groups.push({ label, events: [ev] });
  }
  return groups;
}

// Full activity trail for one lead (sections 41/42) - who did it, when, on
// which platform, and system-initiated steps show up as "System" rather
// than a person. Section 42 adds the field-level "X added/updated -> value"
// breakdown and groups entries by calendar day, matching the level of
// readable detail the reference product's Lead Preview > History tab has.
export default function LeadHistoryModal({ registrationId, timezone, onClose }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    getMyRegistrationAudit(registrationId)
      .then(({ data }) => setEvents([...data.events].reverse()))
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, [registrationId]);

  const filtered = (events || []).filter((ev) => matchesCategory(ev, category));
  const groups = groupByDay(filtered, timezone);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>History - {registrationId}</h3>
          <button className="link" onClick={onClose}>Close</button>
        </div>

        {error && <div className="error-box">{error}</div>}
        {!events && !error && <p className="hint">Loading...</p>}

        {events && (
          <>
            <div className="status-tabs history-category-filter">
              {CATEGORY_TABS.map((tab) => (
                <button key={tab.key} className={category === tab.key ? 'active' : ''} onClick={() => setCategory(tab.key)}>
                  {tab.label}
                </button>
              ))}
            </div>

            {groups.map((group) => (
              <div className="history-day-group" key={group.label}>
                <div className="history-day-label">{group.label}</div>
                <div className="history-timeline">
                  {group.events.map((ev) => (
                    <div className="history-entry" key={ev.auditId}>
                      <span className="history-dot" />
                      <div className="history-entry-body">
                        <div className="history-entry-header">
                          <span>
                            Done by {ev.actor === 'SYSTEM' ? 'System' : ev.actor}
                            {ev.platform && <span className="history-platform"> · {ev.platform}</span>}
                          </span>
                          <span className="history-time">{formatTime(ev.timestamp, timezone)}</span>
                        </div>
                        {ev.newValue?.changes?.length > 0 ? (
                          <ul className="history-changes">
                            {ev.newValue.changes.map((c, i) => <ChangeLine change={c} timezone={timezone} key={i} />)}
                          </ul>
                        ) : (
                          <div className="history-description">{ev.description}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {groups.length === 0 && <p className="hint">No history in this category yet.</p>}
          </>
        )}
      </div>
    </div>
  );
}
