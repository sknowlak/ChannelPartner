import { useEffect, useRef, useState } from 'react';
import {
  createNotificationRule, deleteNotificationRule, getMyProfile, listAssignableUsers, listLeadFields, listLeadStatuses,
  listMyRegistrations, listNotificationJobs, listNotificationRules, listRoles, testNotificationRule, updateNotificationRule
} from '../api/client';
import { PERMISSIONS } from '../utils/permissions';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';
import { renderTemplate, SAMPLE_LEAD_PAYLOAD } from '../utils/webhookPreview';
import { TIMING_PRESETS, TIMING_UNITS, describeTiming, presetKeyFor } from '../utils/notificationTiming';
import SettingsCategories from '../components/SettingsCategories';
import LeadSettingsTabs from '../components/LeadSettingsTabs';
import { userLabel } from '../components/LeadQuickUpdate';

const emptyRule = () => ({
  name: '',
  isEnabled: true,
  trigger: { statusName: '', subStatusName: '' },
  timing: { mode: 'IMMEDIATE', amount: 0, unit: 'MINUTES' },
  recipients: { assignedUser: true, owner: false, updatedBy: false, roleIds: [], userIds: [] },
  channels: { inApp: true, email: false, webhook: false },
  webhook: { url: '', headers: {} },
  content: {
    title: '{{customer.name}} - {{status}} {{subStatus}}',
    message: 'Hi {{recipient.name}}, lead {{customer.name}} ({{customer.mobile}}) is now {{status}} {{subStatus}}. Scheduled: {{schedule.at}}. Updated by {{updatedBy.name}}.'
  }
});

// Variables a notification can use - the webhook lead variables plus the
// notification-only ones (who, when, which status).
const NOTIFICATION_VARIABLES = [
  { path: 'customer.name', label: 'Lead name' },
  { path: 'customer.mobile', label: 'Lead mobile' },
  { path: 'customer.email', label: 'Lead email' },
  { path: 'registrationId', label: 'Lead ID' },
  { path: 'status', label: 'Status' },
  { path: 'subStatus', label: 'Sub-status' },
  { path: 'schedule.at', label: 'Scheduled date & time' },
  { path: 'assignedTo.name', label: 'Assigned user' },
  { path: 'updatedBy.name', label: 'Updated by' },
  { path: 'recipient.name', label: 'Recipient name' },
  { path: 'projectId', label: 'Project' },
  { path: 'notes', label: 'Latest note' },
  { path: 'partner.name', label: 'Partner name' }
];

const PREVIEW_EXTRA = {
  status: 'Contacted',
  subStatus: 'Callback Requested',
  schedule: { at: '4 Oct 2026, 11:00 am' },
  assignedTo: { name: 'Priya (Sales)' },
  updatedBy: { name: 'Rahul (rahul)' },
  recipient: { name: 'Priya (Sales)' }
};

function previewText(template) {
  return renderTemplate(template || '', { ...SAMPLE_LEAD_PAYLOAD, ...PREVIEW_EXTRA });
}

const JOB_BADGE = { SENT: 'accepted', FAILED: 'rejected', PENDING: 'pending', PROCESSING: 'pending', SKIPPED: 'inactive', CANCELLED: 'inactive' };

// Settings -> Lead -> Notifications & Schedulers (section 49).
export default function NotificationSettings() {
  const { partner } = useAuth();
  const [rules, setRules] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [jobs, setJobs] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // { ruleId?, form, headersText }
  const [busy, setBusy] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState('message');
  const titleRef = useRef(null);
  const messageRef = useRef(null);

  const canManage = permissions.includes(PERMISSIONS.MANAGE_SETTINGS);

  const loadJobs = () => listNotificationJobs().then(({ data }) => setJobs(data.jobs)).catch(() => {});
  const load = () => {
    Promise.all([listNotificationRules(), listLeadStatuses(), listRoles(), listAssignableUsers(), getMyProfile(), listLeadFields()])
      .then(([{ data: r }, { data: s }, { data: ro }, { data: u }, { data: me }]) => {
        setRules(r.rules);
        setStatuses(s.statuses);
        setRoles(ro.roles || []);
        setUsers(u.users);
        setPermissions(me.permissions || []);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
    loadJobs();
  };
  useEffect(load, []);

  const form = editing?.form;
  const setForm = (patch) => setEditing((e) => ({ ...e, form: { ...e.form, ...patch } }));
  const setNested = (key, patch) => setEditing((e) => ({ ...e, form: { ...e.form, [key]: { ...e.form[key], ...patch } } }));
  const toggleIn = (key, listKey, id) => setEditing((e) => {
    const list = e.form[key][listKey];
    return { ...e, form: { ...e.form, [key]: { ...e.form[key], [listKey]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] } } };
  });

  const insertVariable = (path) => {
    const key = activeTemplate;
    const ref = key === 'title' ? titleRef.current : messageRef.current;
    const current = form.content[key] || '';
    const token = `{{${path}}}`;
    const pos = ref ? ref.selectionStart ?? current.length : current.length;
    setNested('content', { [key]: current.slice(0, pos) + token + current.slice(pos) });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let headers = {};
      if (form.channels.webhook && editing.headersText.trim()) {
        try {
          headers = JSON.parse(editing.headersText);
        } catch {
          throw new Error('Webhook headers must be valid JSON, e.g. {"Authorization": "Bearer xyz"}');
        }
      }
      const payload = { ...form, webhook: { ...form.webhook, headers } };
      if (editing.ruleId) await updateNotificationRule(editing.ruleId, payload);
      else await createNotificationRule(payload);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (rule) => {
    try {
      await updateNotificationRule(rule.ruleId, { isEnabled: !rule.isEnabled });
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const remove = async (rule) => {
    if (!window.confirm(`Delete notification "${rule.name}"? Pending reminders from it are cancelled.`)) return;
    try {
      await deleteNotificationRule(rule.ruleId);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const sendTest = async (rule) => {
    setError(null);
    try {
      const { data } = await listMyRegistrations();
      const fallback = data.registrations[0]?.registrationId || '';
      const registrationId = window.prompt('Send a test of this notification to yourself (in-app) using which lead ID?', fallback);
      if (!registrationId) return;
      const { data: out } = await testNotificationRule(rule.ruleId, registrationId.trim());
      window.alert(`Sent to your bell:\n\n${out.title}\n${out.message}`);
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const statusFor = (name) => statuses.find((s) => s.name === name);
  const triggerStatus = form ? statusFor(form.trigger.statusName) : null;
  const scheduleCapable = form && (!form.trigger.statusName
    || triggerStatus?.requiresSchedule
    || (form.trigger.subStatusName
      ? triggerStatus?.subStatuses.find((x) => x.name === form.trigger.subStatusName)?.requiresSchedule
      : triggerStatus?.subStatuses.some((x) => x.requiresSchedule)));
  const presetKey = form ? (editing.custom ? 'CUSTOM' : presetKeyFor(form.timing)) : null;

  const describeRecipients = (r) => {
    const parts = [];
    if (r.assignedUser) parts.push('Assigned user');
    if (r.owner) parts.push('Owner');
    if (r.updatedBy) parts.push('Updated by');
    for (const id of r.roleIds) parts.push(`Role: ${roles.find((x) => x.roleId === id)?.name || id}`);
    for (const id of r.userIds) parts.push(users.find((x) => x.userId === id)?.name || id);
    return parts.join(', ') || '-';
  };
  const describeChannels = (c) => [c.inApp && 'In-app', c.email && 'Email', c.webhook && 'Webhook'].filter(Boolean).join(', ');
  const ruleName = (ruleId) => rules?.find((r) => r.ruleId === ruleId)?.name || ruleId;

  return (
    <div className="page page-wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>Settings</h1>
          <p className="hint" style={{ margin: 0 }}>
            Notify the right people when a lead reaches a status - immediately, or a set time before/after the date &amp; time scheduled on it.
          </p>
        </div>
        {canManage && <button className="pill-primary" onClick={() => setEditing({ form: emptyRule(), headersText: '{}' })}>+ Add Notification</button>}
      </div>

      <SettingsCategories />
      <LeadSettingsTabs />

      {error && !editing && <div className="error-box">{error}</div>}

      <div className="card">
        <table className="pro-table">
          <thead>
            <tr><th>Notification</th><th>When Status Is</th><th>Sends</th><th>To</th><th>Via</th><th>Enabled</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {rules && rules.map((r) => (
              <tr key={r.ruleId}>
                <td className="primary-cell">{r.name}</td>
                <td>{r.trigger.statusName || 'Any status'}{r.trigger.subStatusName ? ` → ${r.trigger.subStatusName}` : ''}</td>
                <td className="secondary-cell">{describeTiming(r.timing)}</td>
                <td className="secondary-cell">{describeRecipients(r.recipients)}</td>
                <td className="secondary-cell">{describeChannels(r.channels)}</td>
                <td>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={r.isEnabled} disabled={!canManage} onChange={() => toggleEnabled(r)} />
                    <span className="slider" />
                  </label>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {canManage && (
                    <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => setEditing({
                      ruleId: r.ruleId,
                      form: { ...emptyRule(), ...r, webhook: { url: r.webhook?.url || '', headers: r.webhook?.headers || {} } },
                      headersText: JSON.stringify(r.webhook?.headers || {}, null, 2),
                      custom: presetKeyFor(r.timing) === 'CUSTOM'
                    })}>Edit</button>
                  )}
                  <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => sendTest(r)}>Test</button>
                  {canManage && <button className="danger" onClick={() => remove(r)}>Delete</button>}
                </td>
              </tr>
            ))}
            {rules && rules.length === 0 && (
              <tr><td colSpan={7} className="hint">No notifications yet - add one to alert your team when a lead reaches a status.</td></tr>
            )}
          </tbody>
        </table>
        {!rules && !error && <p className="hint">Loading...</p>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="form-section-title" style={{ marginTop: 0 }}><span>Scheduled &amp; Sent</span></h3>
          <button className="secondary" onClick={loadJobs}>Refresh</button>
        </div>
        <table className="pro-table">
          <thead><tr><th>Fires At</th><th>Notification</th><th>Lead</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>
            {jobs && jobs.map((j) => (
              <tr key={j.jobId}>
                <td className="secondary-cell">{formatDateTime(j.fireAt, partner.timezone)}</td>
                <td>{ruleName(j.ruleId)}</td>
                <td className="secondary-cell">{j.registrationId} · {j.context?.statusName}{j.context?.subStatusName ? ` → ${j.context.subStatusName}` : ''}</td>
                <td><span className={`badge ${JOB_BADGE[j.status]}`}>{j.status}</span></td>
                <td className="secondary-cell">
                  {j.note || (j.deliveries || []).map((d) => `${d.channel.replace('_', '-').toLowerCase()} → ${d.recipient}: ${d.status.toLowerCase()}${d.detail && d.status !== 'SENT' ? ` (${d.detail})` : ''}`).join('; ') || '-'}
                </td>
              </tr>
            ))}
            {jobs && jobs.length === 0 && <tr><td colSpan={5} className="hint">Nothing scheduled or sent yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => !busy && setEditing(null)}>
          <form className="modal-card card status-editor" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{editing.ruleId ? 'Edit Notification' : 'New Notification'}</h3>
              <button type="button" className="link" onClick={() => setEditing(null)}>Close</button>
            </div>
            {error && <div className="error-box">{error}</div>}

            <div className="form-grid">
              <div className="field">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm({ name: e.target.value })} placeholder="e.g. Site visit reminder" required autoFocus />
              </div>
              <div className="field">
                <label>When a lead's status is</label>
                <select value={form.trigger.statusName} onChange={(e) => setNested('trigger', { statusName: e.target.value, subStatusName: '' })}>
                  <option value="">Any status</option>
                  {statuses.map((s) => <option key={s.statusId} value={s.name}>{s.name}{s.isActive ? '' : ' (inactive)'}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Sub-status</label>
                <select value={form.trigger.subStatusName} disabled={!triggerStatus || triggerStatus.subStatuses.length === 0} onChange={(e) => setNested('trigger', { subStatusName: e.target.value })}>
                  <option value="">Any sub-status</option>
                  {(triggerStatus?.subStatuses || []).map((x) => <option key={x.subStatusId} value={x.name}>{x.name}{x.requiresSchedule ? ' 🕒' : ''}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Send (scheduler)</label>
                <select
                  value={presetKey}
                  onChange={(e) => {
                    if (e.target.value === 'CUSTOM') {
                      setEditing((ed) => ({ ...ed, custom: true, form: { ...ed.form, timing: { mode: 'BEFORE', amount: 2, unit: 'HOURS' } } }));
                    } else {
                      const preset = TIMING_PRESETS.find((p) => p.key === e.target.value);
                      setEditing((ed) => ({ ...ed, custom: false, form: { ...ed.form, timing: { ...preset.timing } } }));
                    }
                  }}
                >
                  {TIMING_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  <option value="CUSTOM">Custom...</option>
                </select>
              </div>
            </div>

            {presetKey === 'CUSTOM' && (
              <div className="check-row">
                <input type="number" min="1" value={form.timing.amount} onChange={(e) => setNested('timing', { amount: Number(e.target.value) })} style={{ width: '6rem' }} />
                <select value={form.timing.unit} onChange={(e) => setNested('timing', { unit: e.target.value })}>
                  {TIMING_UNITS.map((u) => <option key={u} value={u}>{u.toLowerCase()}</option>)}
                </select>
                <select value={form.timing.mode} onChange={(e) => setNested('timing', { mode: e.target.value })}>
                  <option value="BEFORE">before scheduled time</option>
                  <option value="AFTER">after scheduled time</option>
                </select>
              </div>
            )}
            {form.timing.mode !== 'IMMEDIATE' && !scheduleCapable && (
              <div className="info-box">
                This status doesn't ask for a date &amp; time, so a "before/at/after scheduled time" notification would never fire.
                Turn on <strong>Ask for a date &amp; time</strong> for it under Statuses &amp; Sub-Statuses, or send Immediately.
              </div>
            )}

            <h4 className="drawer-section-title">Send to (any combination)</h4>
            <div className="check-row">
              <label><input type="checkbox" checked={form.recipients.assignedUser} onChange={(e) => setNested('recipients', { assignedUser: e.target.checked })} /> Assigned user (lead owner)</label>
              <label><input type="checkbox" checked={form.recipients.owner} onChange={(e) => setNested('recipients', { owner: e.target.checked })} /> Account owner / admin</label>
              <label><input type="checkbox" checked={form.recipients.updatedBy} onChange={(e) => setNested('recipients', { updatedBy: e.target.checked })} /> Person who updated the status</label>
            </div>
            <div className="recipient-columns">
              <div>
                <label className="field-label">Everyone with role</label>
                <div className="chip-list">
                  {roles.map((r) => (
                    <label key={r.roleId} className={`chip selectable ${form.recipients.roleIds.includes(r.roleId) ? 'on' : ''}`}>
                      <input type="checkbox" checked={form.recipients.roleIds.includes(r.roleId)} onChange={() => toggleIn('recipients', 'roleIds', r.roleId)} />
                      {r.name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label">Specific users (active)</label>
                <div className="chip-list">
                  {users.filter((u) => u.status === 'ACTIVE' || form.recipients.userIds.includes(u.userId)).map((u) => (
                    <label key={u.userId} className={`chip selectable ${form.recipients.userIds.includes(u.userId) ? 'on' : ''}`}>
                      <input type="checkbox" checked={form.recipients.userIds.includes(u.userId)} onChange={() => toggleIn('recipients', 'userIds', u.userId)} />
                      {userLabel(u)}{u.status !== 'ACTIVE' ? ' (inactive)' : ''}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <p className="hint">Inactive users never receive notifications, even if selected.</p>

            <h4 className="drawer-section-title">Deliver via</h4>
            <div className="check-row">
              <label><input type="checkbox" checked={form.channels.inApp} onChange={(e) => setNested('channels', { inApp: e.target.checked })} /> In-app (bell)</label>
              <label><input type="checkbox" checked={form.channels.email} onChange={(e) => setNested('channels', { email: e.target.checked })} /> Email</label>
              <label><input type="checkbox" checked={form.channels.webhook} onChange={(e) => setNested('channels', { webhook: e.target.checked })} /> Webhook (WhatsApp / SMS provider)</label>
            </div>
            {form.channels.email && <p className="hint">Email goes to each recipient's email address and needs SMTP set up on the server (backend/.env); until then email sends are logged as skipped.</p>}
            {form.channels.webhook && (
              <div className="form-grid">
                <div className="field">
                  <label>Webhook URL (POST, JSON)</label>
                  <input type="url" value={form.webhook.url} onChange={(e) => setNested('webhook', { url: e.target.value })} placeholder="https://your-whatsapp-provider.example/send" required />
                </div>
                <div className="field">
                  <label>Headers (JSON)</label>
                  <textarea rows={2} value={editing.headersText} onChange={(e) => setEditing((ed) => ({ ...ed, headersText: e.target.value }))} style={{ fontFamily: 'monospace', fontSize: '0.82rem' }} />
                </div>
              </div>
            )}

            <h4 className="drawer-section-title">Notification content</h4>
            <div className="field">
              <label>Title</label>
              <input ref={titleRef} value={form.content.title} onFocus={() => setActiveTemplate('title')} onChange={(e) => setNested('content', { title: e.target.value })} />
            </div>
            <div className="field">
              <label>Message</label>
              <textarea ref={messageRef} rows={3} value={form.content.message} onFocus={() => setActiveTemplate('message')} onChange={(e) => setNested('content', { message: e.target.value })} />
            </div>
            <div className="placeholder-group-label">Insert into {activeTemplate === 'title' ? 'Title' : 'Message'}</div>
            <div className="placeholder-chips">
              {NOTIFICATION_VARIABLES.map((v) => (
                <button type="button" key={v.path} className="placeholder-chip" title={`{{${v.path}}}`} onClick={() => insertVariable(v.path)}>{v.label}</button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 0 }}>Any lead field works too, e.g. <code>{'{{budgetMax}}'}</code> or <code>{'{{customFields.unitNumber}}'}</code>.</p>
            <div className="notification-preview">
              <div className="hint">Preview (sample lead)</div>
              <strong>{previewText(form.content.title)}</strong>
              <div>{previewText(form.content.message)}</div>
            </div>

            <div className="drawer-footer">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: 'auto' }}>
                <input type="checkbox" checked={form.isEnabled} onChange={(e) => setForm({ isEnabled: e.target.checked })} /> Enabled
              </label>
              <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving...' : editing.ruleId ? 'Save Notification' : 'Create Notification'}</button>
              <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
