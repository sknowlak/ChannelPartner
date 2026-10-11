import { useEffect, useMemo, useState } from 'react';
import { assignRegistration, listAssignableUsers, listLeadFields, listLeadStatuses, updateMyProgress } from '../api/client';
import DynamicFieldInput from './DynamicFieldInput';
import { fromZonedInputValue, toZonedInputValue } from '../utils/timezone';

// Assignable users (owner + team, with status), the partner's own status
// catalogue (section 49) and the enabled lead fields - loaded once per
// screen that shows quick updates.
export function useLeadWorkflowOptions() {
  const [options, setOptions] = useState({ users: [], statuses: [], fieldDefs: [], loaded: false });
  useEffect(() => {
    Promise.all([listAssignableUsers(), listLeadStatuses(), listLeadFields()])
      .then(([{ data: u }, { data: s }, { data: f }]) => setOptions({
        users: u.users,
        statuses: s.statuses,
        fieldDefs: f.definitions.filter((d) => d.isEnabled),
        loaded: true
      }))
      .catch(() => setOptions((o) => ({ ...o, loaded: true })));
  }, []);
  return options;
}

export function userLabel(user) {
  return user.isOwner ? `${user.name} (Owner)` : user.name;
}

// Only ACTIVE users are offered. If the lead is currently assigned to
// someone since deactivated, they're kept as a disabled option so the
// picker shows the truth instead of silently reading "Unassigned".
export function AssignSelect({ users, value, onChange, disabled, style }) {
  const active = users.filter((u) => u.status === 'ACTIVE');
  const current = value ? users.find((u) => u.userId === value) : null;
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={style}>
      <option value="">Unassigned</option>
      {current && current.status !== 'ACTIVE' && <option value={current.userId} disabled>{current.name} (inactive)</option>}
      {value && !current && <option value={value} disabled>Unknown user</option>}
      {active.map((u) => <option key={u.userId} value={u.userId}>{userLabel(u)}</option>)}
    </select>
  );
}

// Mirrors leadStatusService.resolveStatus: the status's schedule prompt and
// fields, plus the sub-status's (a field is mandatory if either says so).
export function resolveStatusForm(statuses, statusName, subStatusName) {
  const status = statuses.find((s) => s.name === statusName);
  const sub = status?.subStatuses.find((s) => s.name === subStatusName);
  const fieldMap = new Map();
  for (const f of [...(status?.fields || []), ...(sub?.fields || [])]) {
    fieldMap.set(f.fieldKey, { fieldKey: f.fieldKey, isRequired: !!(fieldMap.get(f.fieldKey)?.isRequired || f.isRequired) });
  }
  return {
    status,
    sub,
    requiresSchedule: !!(status?.requiresSchedule || sub?.requiresSchedule),
    scheduleLabel: sub?.scheduleLabel || status?.scheduleLabel || 'Scheduled at',
    fields: [...fieldMap.values()]
  };
}

function currentFieldValue(def, lead, customer) {
  if (def.scope === 'customer') return customer?.[def.fieldKey];
  if (def.scope === 'registration') return lead[def.fieldKey];
  return lead.customFields?.[def.fieldKey];
}

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);


// "Someone connects with the lead and quickly updates it" (sections 48/49):
// reassign (saves on change), and status + sub-status + scheduled date &
// time + that status's configured lead fields + a note (one Update action).
// `lead` is the Registration document; `customer` its Customer.
// `timezone` is the user's profile zone - the date & time is typed in it.
export default function LeadQuickUpdate({ lead, customer, users, statuses, fieldDefs = [], timezone, canEdit, onUpdated }) {
  const toLocalInput = (value) => toZonedInputValue(value, timezone);
  const [stage, setStage] = useState(lead.currentStage);
  const [subStatus, setSubStatus] = useState(lead.subStatus || '');
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(lead.scheduledAt));
  const [fieldValues, setFieldValues] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    setStage(lead.currentStage);
    setSubStatus(lead.subStatus || '');
    setScheduledAt(toLocalInput(lead.scheduledAt));
    setFieldValues({});
  }, [lead.registrationId, lead.currentStage, lead.subStatus, lead.scheduledAt]);

  const config = useMemo(() => resolveStatusForm(statuses, stage, subStatus), [statuses, stage, subStatus]);
  const formFields = config.fields
    .map((f) => ({ ...f, def: fieldDefs.find((d) => d.fieldKey === f.fieldKey) }))
    .filter((f) => f.def && f.def.fieldKey !== 'notes');
  const notesRequired = config.fields.some((f) => f.fieldKey === 'notes' && f.isRequired);
  const valueOf = (def) => (fieldValues[def.fieldKey] !== undefined ? fieldValues[def.fieldKey] : currentFieldValue(def, lead, customer));

  const flash = (msg) => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2500);
  };

  const handleAssign = async (assignedTo) => {
    setError(null);
    setBusy(true);
    try {
      const { data } = await assignRegistration(lead.registrationId, assignedTo);
      onUpdated?.({ assignedTo: data.assignedTo, assignedToName: data.assignedToName });
      flash(data.assignedToName ? `Assigned to ${data.assignedToName}` : 'Unassigned');
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = { stage, subStatus, notes: note };
      if (config.requiresSchedule) payload.scheduledAt = scheduledAt ? fromZonedInputValue(scheduledAt, timezone) : '';
      if (Object.keys(fieldValues).length) payload.fields = fieldValues;
      const { data } = await updateMyProgress(lead.registrationId, payload);
      onUpdated?.({
        currentStage: data.currentStage, subStatus: data.subStatus, notes: data.notes, scheduledAt: data.scheduledAt,
        ...(Object.keys(fieldValues).length ? { fieldsChanged: true } : {})
      });
      setNote('');
      flash('Status updated');
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  // The lead's current status stays selectable even if since deactivated.
  const stageOptions = statuses.filter((s) => (s.isActive && !s.isBooking) || s.name === lead.currentStage);
  const subStatusOptions = (config.status?.subStatuses || []).filter((s) => s.isActive || s.name === lead.subStatus);
  const dirty = stage !== lead.currentStage
    || subStatus !== (lead.subStatus || '')
    || note.trim() !== ''
    || Object.keys(fieldValues).length > 0
    || (config.requiresSchedule && scheduledAt !== toLocalInput(lead.scheduledAt));

  return (
    <div className="quick-update">
      <div className="field">
        <label>Assigned To</label>
        <AssignSelect users={users} value={lead.assignedTo} onChange={handleAssign} disabled={!canEdit || busy} />
      </div>

      {lead.isBooked ? (
        <p className="hint">This lead is booked - its status can no longer be changed.</p>
      ) : (
        <form onSubmit={handleStatus}>
          <div className="quick-update-row">
            <div className="field">
              <label>Status</label>
              <select
                value={stage}
                disabled={!canEdit || busy}
                onChange={(e) => { setStage(e.target.value); setSubStatus(''); setFieldValues({}); }}
              >
                {stageOptions.map((s) => <option key={s.statusId} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Sub-Status</label>
              <select value={subStatus} disabled={!canEdit || busy || subStatusOptions.length === 0} onChange={(e) => setSubStatus(e.target.value)}>
                <option value="">{subStatusOptions.length ? 'Select sub-status...' : 'None'}</option>
                {subStatusOptions.map((s) => <option key={s.subStatusId} value={s.name}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {config.requiresSchedule && (
            <div className="field">
              <label>{config.scheduleLabel} <span className="required-mark">*</span> <span className="hint">({timezone || 'local time'})</span></label>
              <input type="datetime-local" value={scheduledAt} required disabled={!canEdit || busy} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
          )}

          {formFields.length > 0 && (
            <div className="status-fields">
              {formFields.map(({ def, isRequired }) => (
                <div className="field" key={def.fieldKey}>
                  <label>{def.label}{isRequired && <span className="required-mark"> *</span>}</label>
                  <DynamicFieldInput
                    def={{ ...def, isRequired }}
                    value={valueOf(def)}
                    onChange={(v) => setFieldValues((fv) => ({ ...fv, [def.fieldKey]: v }))}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="field">
            <label>Note{notesRequired && isEmpty(lead.notes) && <span className="required-mark"> *</span>}</label>
            <textarea
              rows={3}
              value={note}
              disabled={!canEdit || busy}
              required={notesRequired && isEmpty(lead.notes)}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What happened on this call / visit? (optional)"
            />
          </div>
          {canEdit && (
            <button className="primary" type="submit" disabled={busy || !dirty}>{busy ? 'Saving...' : 'Update Status'}</button>
          )}
        </form>
      )}

      {!canEdit && <p className="hint">You can view this lead, but your role can't update it.</p>}
      {error && <div className="error-box" style={{ marginTop: '0.6rem' }}>{error}</div>}
      {saved && <div className="success-flash">{saved}</div>}
    </div>
  );
}
