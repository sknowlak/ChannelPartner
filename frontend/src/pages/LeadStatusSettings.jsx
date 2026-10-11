import { useEffect, useState } from 'react';
import {
  createLeadStatus, deleteLeadStatus, getMyProfile, listLeadFields, listLeadStatuses, updateLeadStatus
} from '../api/client';
import { PERMISSIONS } from '../utils/permissions';
import SettingsCategories from '../components/SettingsCategories';
import LeadSettingsTabs from '../components/LeadSettingsTabs';
import StatusFieldsPicker from '../components/StatusFieldsPicker';

const emptySub = () => ({ key: Math.random().toString(36).slice(2), name: '', isActive: true, requiresSchedule: false, scheduleLabel: '', fields: [], open: false });
const emptyStatus = () => ({
  name: '', color: '#2f6fed', isActive: true, isDefault: false, isBooking: false,
  requiresSchedule: false, scheduleLabel: '', fields: [], subStatuses: []
});

function toForm(status) {
  return {
    ...status,
    subStatuses: status.subStatuses.map((s) => ({ ...s, key: s.subStatusId, open: false }))
  };
}

function toPayload(form) {
  return {
    name: form.name, color: form.color, isActive: form.isActive, isDefault: form.isDefault, isBooking: form.isBooking,
    requiresSchedule: form.requiresSchedule, scheduleLabel: form.scheduleLabel, fields: form.fields,
    subStatuses: form.subStatuses.map(({ subStatusId, name, isActive, requiresSchedule, scheduleLabel, fields }) => ({
      subStatusId, name, isActive, requiresSchedule, scheduleLabel, fields
    }))
  };
}

// Settings -> Lead -> Statuses & Sub-Statuses (section 49): fully custom
// statuses. Each status (and each sub-status) can ask for a date & time
// when a lead is moved to it, and can show chosen lead fields - optional or
// mandatory - on the status-update form.
export default function LeadStatusSettings() {
  const [statuses, setStatuses] = useState(null);
  const [fieldDefs, setFieldDefs] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // { statusId?, form }
  const [busy, setBusy] = useState(false);

  const canManage = permissions.includes(PERMISSIONS.MANAGE_SETTINGS);

  const load = () => {
    Promise.all([listLeadStatuses(), listLeadFields(), getMyProfile()])
      .then(([{ data }, { data: fieldData }, { data: me }]) => {
        setStatuses(data.statuses);
        setFieldDefs(fieldData.definitions.filter((d) => d.isEnabled));
        setPermissions(me.permissions || []);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };
  useEffect(load, []);

  const labelFor = (key) => fieldDefs.find((d) => d.fieldKey === key)?.label || key;

  const setForm = (patch) => setEditing((e) => ({ ...e, form: { ...e.form, ...(typeof patch === 'function' ? patch(e.form) : patch) } }));
  const setSub = (key, patch) => setForm((f) => ({ subStatuses: f.subStatuses.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
  const moveSub = (index, dir) => setForm((f) => {
    const list = [...f.subStatuses];
    const target = index + dir;
    if (target < 0 || target >= list.length) return {};
    [list[index], list[target]] = [list[target], list[index]];
    return { subStatuses: list };
  });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing.statusId) await updateLeadStatus(editing.statusId, toPayload(editing.form));
      else await createLeadStatus(toPayload(editing.form));
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (status) => {
    if (!window.confirm(`Delete status "${status.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteLeadStatus(status.statusId);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const move = async (index, dir) => {
    const list = [...statuses];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    setStatuses(list);
    try {
      await Promise.all(list.map((s, i) => (s.sortOrder === i ? null : updateLeadStatus(s.statusId, { sortOrder: i }))));
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const toggleActive = async (status) => {
    setError(null);
    try {
      await updateLeadStatus(status.statusId, { isActive: !status.isActive });
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const form = editing?.form;

  return (
    <div className="page page-wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>Settings</h1>
          <p className="hint" style={{ margin: 0 }}>
            Your lead statuses and sub-statuses - what each one asks for (a date &amp; time, lead fields) when someone updates a lead to it.
          </p>
        </div>
        {canManage && <button className="pill-primary" onClick={() => setEditing({ form: emptyStatus() })}>+ Add Status</button>}
      </div>

      <SettingsCategories />
      <LeadSettingsTabs />

      {error && !editing && <div className="error-box">{error}</div>}

      <div className="card">
        <table className="pro-table">
          <thead>
            <tr><th>Order</th><th>Status</th><th>Sub-Statuses</th><th>Asks For</th><th>Active</th>{canManage && <th>Actions</th>}</tr>
          </thead>
          <tbody>
            {statuses && statuses.map((s, i) => {
              const scheduled = s.subStatuses.filter((x) => x.requiresSchedule).map((x) => x.name);
              return (
                <tr key={s.statusId} className={s.isActive ? '' : 'row-muted'}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canManage && (
                      <>
                        <button className="order-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">▲</button>
                        <button className="order-btn" disabled={i === statuses.length - 1} onClick={() => move(i, 1)} title="Move down">▼</button>
                      </>
                    )}
                  </td>
                  <td>
                    <div className="primary-cell"><span className="status-dot" style={{ background: s.color }} />{s.name}</div>
                    <div className="status-flags">
                      {s.isDefault && <span className="badge accepted">Default for new leads</span>}
                      {s.isBooking && <span className="badge pending">Booking status</span>}
                    </div>
                  </td>
                  <td>
                    <div className="chip-list">
                      {s.subStatuses.map((x) => (
                        <span key={x.subStatusId} className={`chip ${x.isActive ? '' : 'muted'}`} title={x.requiresSchedule ? `Asks for ${x.scheduleLabel || 'date & time'}` : ''}>
                          {x.name}{x.requiresSchedule && ' 🕒'}
                        </span>
                      ))}
                      {s.subStatuses.length === 0 && <span className="hint">None</span>}
                    </div>
                  </td>
                  <td className="secondary-cell">
                    {s.requiresSchedule && <div>🕒 {s.scheduleLabel || 'Date & time'}</div>}
                    {scheduled.length > 0 && <div>🕒 on {scheduled.join(', ')}</div>}
                    {s.fields.length > 0 && (
                      <div title={s.fields.map((f) => `${labelFor(f.fieldKey)}${f.isRequired ? ' *' : ''}`).join(', ')}>
                        {s.fields.length} field{s.fields.length === 1 ? '' : 's'} ({s.fields.filter((f) => f.isRequired).length} mandatory)
                      </div>
                    )}
                    {!s.requiresSchedule && scheduled.length === 0 && s.fields.length === 0 && '-'}
                  </td>
                  <td>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={s.isActive} disabled={!canManage || s.isDefault} onChange={() => toggleActive(s)} />
                      <span className="slider" />
                    </label>
                  </td>
                  {canManage && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => setEditing({ statusId: s.statusId, form: toForm(s) })}>Edit</button>
                      {!s.isDefault && <button className="danger" onClick={() => remove(s)}>Delete</button>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!statuses && !error && <p className="hint">Loading...</p>}
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => !busy && setEditing(null)}>
          <form className="modal-card card status-editor" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{editing.statusId ? `Edit Status - ${statuses.find((s) => s.statusId === editing.statusId)?.name}` : 'New Status'}</h3>
              <button type="button" className="link" onClick={() => setEditing(null)}>Close</button>
            </div>
            {error && <div className="error-box">{error}</div>}

            <div className="form-grid">
              <div className="field">
                <label>Status Name</label>
                <input value={form.name} onChange={(e) => setForm({ name: e.target.value })} required autoFocus />
              </div>
              <div className="field">
                <label>Colour</label>
                <input type="color" value={form.color} onChange={(e) => setForm({ color: e.target.value })} style={{ height: '2.4rem', padding: '0.2rem' }} />
              </div>
            </div>

            <div className="check-row">
              <label><input type="checkbox" checked={form.isActive} disabled={form.isDefault} onChange={(e) => setForm({ isActive: e.target.checked })} /> Active</label>
              <label><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ isDefault: e.target.checked, isActive: e.target.checked ? true : form.isActive })} /> Default status for new leads</label>
              <label><input type="checkbox" checked={form.isBooking} onChange={(e) => setForm({ isBooking: e.target.checked })} /> Booking status (set by Complete Booking)</label>
            </div>

            <h4 className="drawer-section-title">When a lead is moved to this status</h4>
            <div className="check-row">
              <label><input type="checkbox" checked={form.requiresSchedule} onChange={(e) => setForm({ requiresSchedule: e.target.checked })} /> Ask for a date &amp; time (scheduler)</label>
              {form.requiresSchedule && (
                <input value={form.scheduleLabel} onChange={(e) => setForm({ scheduleLabel: e.target.value })} placeholder="Label, e.g. Visit at" style={{ maxWidth: '16rem' }} />
              )}
            </div>
            <label className="field-label">Lead fields to show on the update form</label>
            <StatusFieldsPicker fieldDefs={fieldDefs} value={form.fields} onChange={(fields) => setForm({ fields })} />

            <h4 className="drawer-section-title">Sub-Statuses</h4>
            <p className="hint" style={{ marginTop: 0 }}>
              Each sub-status can ask for its own date &amp; time and add its own fields - shown on top of the status's fields above.
            </p>
            {form.subStatuses.map((sub, i) => (
              <div key={sub.key} className="sub-status-editor">
                <div className="sub-status-row">
                  <span className="order-btns">
                    <button type="button" className="order-btn" disabled={i === 0} onClick={() => moveSub(i, -1)}>▲</button>
                    <button type="button" className="order-btn" disabled={i === form.subStatuses.length - 1} onClick={() => moveSub(i, 1)}>▼</button>
                  </span>
                  <input value={sub.name} onChange={(e) => setSub(sub.key, { name: e.target.value })} placeholder="Sub-status name" required />
                  <label><input type="checkbox" checked={sub.isActive} onChange={(e) => setSub(sub.key, { isActive: e.target.checked })} /> Active</label>
                  <label><input type="checkbox" checked={sub.requiresSchedule} onChange={(e) => setSub(sub.key, { requiresSchedule: e.target.checked })} /> Date &amp; time</label>
                  <button type="button" className="secondary" onClick={() => setSub(sub.key, { open: !sub.open })}>
                    Fields ({sub.fields.length}){sub.open ? ' ▴' : ' ▾'}
                  </button>
                  <button type="button" className="danger" onClick={() => setForm((f) => ({ subStatuses: f.subStatuses.filter((s) => s.key !== sub.key) }))}>Remove</button>
                </div>
                {sub.requiresSchedule && (
                  <input className="sub-status-schedule" value={sub.scheduleLabel} onChange={(e) => setSub(sub.key, { scheduleLabel: e.target.value })} placeholder="Date & time label, e.g. Call back at" />
                )}
                {sub.open && <StatusFieldsPicker fieldDefs={fieldDefs} value={sub.fields} onChange={(fields) => setSub(sub.key, { fields })} />}
              </div>
            ))}
            <button type="button" className="secondary" onClick={() => setForm((f) => ({ subStatuses: [...f.subStatuses, { ...emptySub(), open: false }] }))}>+ Add Sub-Status</button>

            <div className="drawer-footer">
              <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving...' : editing.statusId ? 'Save Status' : 'Create Status'}</button>
              <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
