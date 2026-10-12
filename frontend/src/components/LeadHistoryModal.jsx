import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { getMyRegistrationAudit } from '../api/client';
import { dayLabel, formatDateTime, formatTime } from '../utils/timezone';
import { fieldLabel, optionLabel, statusLabel, subStatusLabel } from '../i18n/dataLabels';

// Labels are i18n keys (leads:history.tabs.*), resolved at render time.
const CATEGORY_TABS = ['all', 'status', 'assignment', 'notes'];

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

// Labels the server writes for the status/assignment pseudo-fields - shown
// translated while they still read exactly like this.
const SYSTEM_CHANGE_LABELS = {
  stage: 'Status', subStatus: 'Sub-Status', scheduledAt: 'Schedule', notes: 'Notes', assignedTo: 'Assigned To'
};

export function changeLabel(change) {
  const key = change.fieldKey;
  if (SYSTEM_CHANGE_LABELS[key] && SYSTEM_CHANGE_LABELS[key] === change.label) return i18n.t(`leads:history.fieldLabels.${key}`);
  if (key === 'scheduledAt' && change.label === 'Scheduled at') return i18n.t('leads:quick.scheduledAt');
  return fieldLabel(change) || change.label;
}

// Display-only: status / sub-status / option values that still equal a
// built-in default are translated; anything typed is shown as stored.
function displayValue(fieldKey, value) {
  if (fieldKey === 'stage') return statusLabel(value);
  if (fieldKey === 'subStatus') return subStatusLabel(value);
  if (fieldKey === 'assignedTo' && value === 'Unassigned') return i18n.t('leads:assign.unassigned');
  return optionLabel(value);
}

function formatChangeValue(value, timezone, fieldKey) {
  const empty = i18n.t('leads:history.empty');
  if (value === undefined || value === null || value === '') return empty;
  if (typeof value === 'string' && ISO_DATE_TIME.test(value)) return formatDateTime(value, timezone);
  if (Array.isArray(value)) return value.map((v) => optionLabel(v)).join(', ') || empty;
  return String(displayValue(fieldKey, String(value)));
}

const PLATFORM_LABELS = new Set(['System', 'External', 'Web', 'Mobile']);
export function platformLabel(platform) {
  return PLATFORM_LABELS.has(platform) ? i18n.t(`leads:history.platforms.${platform}`) : platform;
}

export function actorLabel(actor) {
  return actor === 'SYSTEM' ? i18n.t('leads:history.system') : actor;
}

// Audit descriptions are stored in English by the server. For event types
// that always produce the same sentence, rebuild it in the UI language from
// the event's data (or the values embedded in the English text); anything
// unrecognised falls back to the server's description unchanged.
export function describeEvent(ev) {
  const d = ev.description || '';
  const k = (key, opts) => i18n.t(`leads:history.events.${key}`, opts);
  let m;
  switch (ev.eventType) {
    case 'REGISTRATION_RECEIVED':
    case 'DUPLICATE_CHECK_COMPLETED':
    case 'REGISTRATION_ACCEPTED':
    case 'BOOKING_COMPLETED':
    case 'OPERATIONAL_OWNERSHIP_TRANSFERRED':
    case 'PARTNER_ATTRIBUTION_PRESERVED':
    case 'COMMISSION_ELIGIBILITY_CREATED':
    case 'HANDOVER_COMPLETED':
    case 'REFERRAL_ACCEPTED':
      return k(ev.eventType);
    case 'PROTECTION_GRANTED':
      m = /^(\d+)-day protection granted$/.exec(d);
      return m ? k('PROTECTION_GRANTED', { count: Number(m[1]) }) : d;
    case 'REGISTRATION_ATTEMPT_REJECTED':
      m = /^Duplicate registration attempt by (.+) rejected$/.exec(d);
      return m ? k('REGISTRATION_ATTEMPT_REJECTED', { partnerId: m[1] }) : d;
    case 'LEAD_DETAILS_UPDATED':
      m = /^Updated (\d+) fields?$/.exec(d);
      return m ? k('LEAD_DETAILS_UPDATED', { count: Number(m[1]) }) : d;
    case 'STAGE_UPDATED': {
      const stage = ev.newValue?.stage;
      if (!stage || !d.startsWith('Status updated to ')) return d;
      const sub = ev.newValue?.subStatus;
      const status = sub
        ? i18n.t('leads:history.statusWithSub', { status: statusLabel(stage), subStatus: subStatusLabel(sub) })
        : statusLabel(stage);
      return k('STAGE_UPDATED', { status });
    }
    case 'LEAD_ASSIGNED':
      if (d === 'Unassigned') return k('LEAD_UNASSIGNED');
      m = /^Assigned to (.+)$/.exec(d);
      return m ? k('LEAD_ASSIGNED', { name: m[1] }) : d;
    case 'REFERRAL_REJECTED':
      m = /^Builder rejected the referral\. Reason: ([\s\S]*)$/.exec(d);
      return m ? k('REFERRAL_REJECTED', { reason: m[1] }) : d;
    case 'ADMIN_PROTECTION_RELEASED':
      m = /^Admin released duplicate protection early\. Reason: ([\s\S]*)$/.exec(d);
      return m ? k('ADMIN_PROTECTION_RELEASED', { reason: m[1] }) : d;
    case 'ADMIN_PARTNER_REASSIGNED':
      m = /^Admin reassigned registration from (.*) to (\S+)\. Reason: ([\s\S]*)$/.exec(d);
      return m ? k('ADMIN_PARTNER_REASSIGNED', { from: m[1], to: m[2], reason: m[3] }) : d;
    default:
      return d;
  }
}

// A change entry is either {fieldKey,label,value} (set at creation - always
// "added") or {fieldKey,label,from,to} (an edit - "added" if it had no
// previous value, "updated" otherwise).
function ChangeLine({ change, timezone }) {
  const { t } = useTranslation('leads');
  if (change.value !== undefined) {
    return (
      <li>
        <strong>{changeLabel(change)}</strong> <span className="history-verb">{t('history.added')}</span>
        <span className="history-arrow">→</span>
        <span className="history-value">{formatChangeValue(change.value, timezone, change.fieldKey)}</span>
      </li>
    );
  }
  const hadPrevious = change.from !== undefined && change.from !== null && change.from !== '';
  return (
    <li>
      <strong>{changeLabel(change)}</strong> <span className="history-verb">{hadPrevious ? t('history.updated') : t('history.added')}</span>
      <span className="history-arrow">→</span>
      <span className="history-value">{formatChangeValue(change.to, timezone, change.fieldKey)}</span>
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
  const { t } = useTranslation(['leads', 'common', 'data']);
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
          <h3 style={{ margin: 0 }}>{t('leads:history.title', { registrationId })}</h3>
          <button className="link" onClick={onClose}>{t('common:actions.close')}</button>
        </div>

        {error && <div className="error-box">{error}</div>}
        {!events && !error && <p className="hint">{t('common:states.loading')}</p>}

        {events && (
          <>
            <div className="status-tabs history-category-filter">
              {CATEGORY_TABS.map((key) => (
                <button key={key} className={category === key ? 'active' : ''} onClick={() => setCategory(key)}>
                  {t(`leads:history.tabs.${key}`)}
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
                            {t('leads:history.doneBy', { actor: actorLabel(ev.actor) })}
                            {ev.platform && <span className="history-platform"> · {platformLabel(ev.platform)}</span>}
                          </span>
                          <span className="history-time">{formatTime(ev.timestamp, timezone)}</span>
                        </div>
                        {ev.newValue?.changes?.length > 0 ? (
                          <ul className="history-changes">
                            {ev.newValue.changes.map((c, i) => <ChangeLine change={c} timezone={timezone} key={i} />)}
                          </ul>
                        ) : (
                          <div className="history-description">{describeEvent(ev)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {groups.length === 0 && <p className="hint">{t('leads:history.noHistory')}</p>}
          </>
        )}
      </div>
    </div>
  );
}
