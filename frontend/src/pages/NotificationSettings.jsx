import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  createNotificationRule, deleteNotificationRule, getMyProfile, listAssignableUsers, listLeadFields, listLeadStatuses,
  listMyRegistrations, listNotificationJobs, listNotificationRules, listRoles, testNotificationRule, updateNotificationRule
} from '../api/client';
import { PERMISSIONS } from '../utils/permissions';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';
import { renderTemplate, SAMPLE_LEAD_PAYLOAD } from '../utils/webhookPreview';
import { TIMING_PRESETS, TIMING_UNITS, describeTiming, presetKeyFor, presetLabel, unitLabel } from '../utils/notificationTiming';
import { useDataLabels } from '../i18n/dataLabels';
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
// notification-only ones (who, when, which status). `labelKey` is under
// settings:notifications.variables; the {{path}} itself is never translated.
const NOTIFICATION_VARIABLES = [
  { path: 'customer.name', labelKey: 'customerName' },
  { path: 'customer.mobile', labelKey: 'customerMobile' },
  { path: 'customer.email', labelKey: 'customerEmail' },
  { path: 'registrationId', labelKey: 'registrationId' },
  { path: 'status', labelKey: 'status' },
  { path: 'subStatus', labelKey: 'subStatus' },
  { path: 'schedule.at', labelKey: 'scheduleAt' },
  { path: 'assignedTo.name', labelKey: 'assignedTo' },
  { path: 'updatedBy.name', labelKey: 'updatedBy' },
  { path: 'recipient.name', labelKey: 'recipient' },
  { path: 'projectId', labelKey: 'project' },
  { path: 'notes', labelKey: 'notes' },
  { path: 'partner.name', labelKey: 'partner' }
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

// Shared <code> wrapper for the Trans examples in the template help text.
const CODE = <code />;

const JOB_BADGE = { SENT: 'accepted', FAILED: 'rejected', PENDING: 'pending', PROCESSING: 'pending', SKIPPED: 'inactive', CANCELLED: 'inactive' };

// Settings -> Lead -> Notifications & Schedulers (section 49).
export default function NotificationSettings() {
  const { t } = useTranslation(['settings', 'common']);
  const { statusLabel, subStatusLabel, roleLabel } = useDataLabels();
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
          throw new Error(t('settings:notifications.headersInvalid'));
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
    if (!window.confirm(t('settings:notifications.deleteConfirm', { name: rule.name }))) return;
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
      const registrationId = window.prompt(t('settings:notifications.testPrompt'), fallback);
      if (!registrationId) return;
      const { data: out } = await testNotificationRule(rule.ruleId, registrationId.trim());
      window.alert(t('settings:notifications.testSent', { title: out.title, message: out.message }));
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
    if (r.assignedUser) parts.push(t('settings:notifications.recipients.assignedUser'));
    if (r.owner) parts.push(t('settings:notifications.recipients.owner'));
    if (r.updatedBy) parts.push(t('settings:notifications.recipients.updatedBy'));
    for (const id of r.roleIds) {
      const role = roles.find((x) => x.roleId === id);
      parts.push(t('settings:notifications.recipients.role', { name: role ? roleLabel(role.name) : id }));
    }
    for (const id of r.userIds) parts.push(users.find((x) => x.userId === id)?.name || id);
    return parts.join(', ') || '-';
  };
  const describeChannels = (c) => [
    c.inApp && t('settings:notifications.channels.inApp'),
    c.email && t('settings:notifications.channels.email'),
    c.webhook && t('settings:notifications.channels.webhook')
  ].filter(Boolean).join(', ');
  // d.detail (like j.note) comes from the server and is shown as-is.
  const describeDelivery = (d) => {
    const values = {
      channel: t(`settings:notifications.deliveryChannel.${d.channel}`, { defaultValue: d.channel }),
      recipient: d.recipient,
      status: t(`settings:notifications.deliveryStatus.${d.status}`, { defaultValue: d.status }),
      detail: d.detail
    };
    return d.detail && d.status !== 'SENT'
      ? t('settings:notifications.jobs.deliveryWithDetail', values)
      : t('settings:notifications.jobs.delivery', values);
  };
  const triggerText = (statusName, subStatusName) => (subStatusName
    ? `${statusLabel(statusName)} → ${subStatusLabel(subStatusName)}`
    : statusLabel(statusName));
  const ruleName = (ruleId) => rules?.find((r) => r.ruleId === ruleId)?.name || ruleId;

  return (
    <div className="page page-wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>{t('settings:page.title')}</h1>
          <p className="hint" style={{ margin: 0 }}>
            {t('settings:notifications.intro')}
          </p>
        </div>
        {canManage && <button className="pill-primary" onClick={() => setEditing({ form: emptyRule(), headersText: '{}' })}>{t('settings:notifications.add')}</button>}
      </div>

      <SettingsCategories />
      <LeadSettingsTabs />

      {error && !editing && <div className="error-box">{error}</div>}

      <div className="card">
        <table className="pro-table">
          <thead>
            <tr>
              <th>{t('settings:notifications.columns.notification')}</th><th>{t('settings:notifications.columns.whenStatusIs')}</th>
              <th>{t('settings:notifications.columns.sends')}</th><th>{t('settings:notifications.columns.to')}</th>
              <th>{t('settings:notifications.columns.via')}</th><th>{t('settings:notifications.columns.enabled')}</th><th>{t('common:fields.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rules && rules.map((r) => (
              <tr key={r.ruleId}>
                <td className="primary-cell">{r.name}</td>
                <td>{r.trigger.statusName ? triggerText(r.trigger.statusName, r.trigger.subStatusName) : t('settings:notifications.anyStatus')}</td>
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
                    })}>{t('common:actions.edit')}</button>
                  )}
                  <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => sendTest(r)}>{t('common:actions.test')}</button>
                  {canManage && <button className="danger" onClick={() => remove(r)}>{t('common:actions.delete')}</button>}
                </td>
              </tr>
            ))}
            {rules && rules.length === 0 && (
              <tr><td colSpan={7} className="hint">{t('settings:notifications.emptyRules')}</td></tr>
            )}
          </tbody>
        </table>
        {!rules && !error && <p className="hint">{t('common:states.loading')}</p>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="form-section-title" style={{ marginTop: 0 }}><span>{t('settings:notifications.jobs.title')}</span></h3>
          <button className="secondary" onClick={loadJobs}>{t('common:actions.refresh')}</button>
        </div>
        <table className="pro-table">
          <thead>
            <tr>
              <th>{t('settings:notifications.jobs.firesAt')}</th><th>{t('settings:notifications.jobs.notification')}</th>
              <th>{t('settings:notifications.jobs.lead')}</th><th>{t('settings:notifications.jobs.status')}</th><th>{t('settings:notifications.jobs.details')}</th>
            </tr>
          </thead>
          <tbody>
            {jobs && jobs.map((j) => (
              <tr key={j.jobId}>
                <td className="secondary-cell">{formatDateTime(j.fireAt, partner.timezone)}</td>
                <td>{ruleName(j.ruleId)}</td>
                <td className="secondary-cell">{j.registrationId} · {triggerText(j.context?.statusName, j.context?.subStatusName)}</td>
                <td><span className={`badge ${JOB_BADGE[j.status]}`}>{t(`settings:notifications.jobStatus.${j.status}`, { defaultValue: j.status })}</span></td>
                <td className="secondary-cell">
                  {j.note || (j.deliveries || []).map(describeDelivery).join('; ') || '-'}
                </td>
              </tr>
            ))}
            {jobs && jobs.length === 0 && <tr><td colSpan={5} className="hint">{t('settings:notifications.jobs.empty')}</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => !busy && setEditing(null)}>
          <form className="modal-card card status-editor" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{editing.ruleId ? t('settings:notifications.editTitle') : t('settings:notifications.newTitle')}</h3>
              <button type="button" className="link" onClick={() => setEditing(null)}>{t('common:actions.close')}</button>
            </div>
            {error && <div className="error-box">{error}</div>}

            <div className="form-grid">
              <div className="field">
                <label>{t('settings:notifications.name')}</label>
                <input value={form.name} onChange={(e) => setForm({ name: e.target.value })} placeholder={t('settings:notifications.namePlaceholder')} required autoFocus />
              </div>
              <div className="field">
                <label>{t('settings:notifications.whenStatus')}</label>
                <select value={form.trigger.statusName} onChange={(e) => setNested('trigger', { statusName: e.target.value, subStatusName: '' })}>
                  <option value="">{t('settings:notifications.anyStatus')}</option>
                  {statuses.map((s) => (
                    <option key={s.statusId} value={s.name}>
                      {s.isActive ? statusLabel(s.name) : t('settings:notifications.inactiveOption', { name: statusLabel(s.name) })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('settings:notifications.subStatus')}</label>
                <select value={form.trigger.subStatusName} disabled={!triggerStatus || triggerStatus.subStatuses.length === 0} onChange={(e) => setNested('trigger', { subStatusName: e.target.value })}>
                  <option value="">{t('settings:notifications.anySubStatus')}</option>
                  {(triggerStatus?.subStatuses || []).map((x) => <option key={x.subStatusId} value={x.name}>{subStatusLabel(x.name)}{x.requiresSchedule ? ' 🕒' : ''}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{t('settings:notifications.send')}</label>
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
                  {TIMING_PRESETS.map((p) => <option key={p.key} value={p.key}>{presetLabel(p)}</option>)}
                  <option value="CUSTOM">{t('settings:notifications.custom')}</option>
                </select>
              </div>
            </div>

            {presetKey === 'CUSTOM' && (
              <div className="check-row">
                <input type="number" min="1" value={form.timing.amount} onChange={(e) => setNested('timing', { amount: Number(e.target.value) })} style={{ width: '6rem' }} />
                <select value={form.timing.unit} onChange={(e) => setNested('timing', { unit: e.target.value })}>
                  {TIMING_UNITS.map((u) => <option key={u} value={u}>{unitLabel(u, form.timing.amount)}</option>)}
                </select>
                <select value={form.timing.mode} onChange={(e) => setNested('timing', { mode: e.target.value })}>
                  <option value="BEFORE">{t('settings:notifications.modeBefore')}</option>
                  <option value="AFTER">{t('settings:notifications.modeAfter')}</option>
                </select>
              </div>
            )}
            {form.timing.mode !== 'IMMEDIATE' && !scheduleCapable && (
              <div className="info-box">
                {t('settings:notifications.noScheduleWarning')}{' '}
                <Trans t={t} i18nKey="settings:notifications.noScheduleFix" components={{ strong: <strong /> }} />
              </div>
            )}

            <h4 className="drawer-section-title">{t('settings:notifications.sendTo')}</h4>
            <div className="check-row">
              <label><input type="checkbox" checked={form.recipients.assignedUser} onChange={(e) => setNested('recipients', { assignedUser: e.target.checked })} /> {t('settings:notifications.recipientAssigned')}</label>
              <label><input type="checkbox" checked={form.recipients.owner} onChange={(e) => setNested('recipients', { owner: e.target.checked })} /> {t('settings:notifications.recipientOwner')}</label>
              <label><input type="checkbox" checked={form.recipients.updatedBy} onChange={(e) => setNested('recipients', { updatedBy: e.target.checked })} /> {t('settings:notifications.recipientUpdatedBy')}</label>
            </div>
            <div className="recipient-columns">
              <div>
                <label className="field-label">{t('settings:notifications.everyoneWithRole')}</label>
                <div className="chip-list">
                  {roles.map((r) => (
                    <label key={r.roleId} className={`chip selectable ${form.recipients.roleIds.includes(r.roleId) ? 'on' : ''}`}>
                      <input type="checkbox" checked={form.recipients.roleIds.includes(r.roleId)} onChange={() => toggleIn('recipients', 'roleIds', r.roleId)} />
                      {roleLabel(r.name)}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label">{t('settings:notifications.specificUsers')}</label>
                <div className="chip-list">
                  {users.filter((u) => u.status === 'ACTIVE' || form.recipients.userIds.includes(u.userId)).map((u) => (
                    <label key={u.userId} className={`chip selectable ${form.recipients.userIds.includes(u.userId) ? 'on' : ''}`}>
                      <input type="checkbox" checked={form.recipients.userIds.includes(u.userId)} onChange={() => toggleIn('recipients', 'userIds', u.userId)} />
                      {u.status !== 'ACTIVE' ? t('settings:notifications.inactiveOption', { name: userLabel(u) }) : userLabel(u)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <p className="hint">{t('settings:notifications.inactiveNever')}</p>

            <h4 className="drawer-section-title">{t('settings:notifications.deliverVia')}</h4>
            <div className="check-row">
              <label><input type="checkbox" checked={form.channels.inApp} onChange={(e) => setNested('channels', { inApp: e.target.checked })} /> {t('settings:notifications.channelInApp')}</label>
              <label><input type="checkbox" checked={form.channels.email} onChange={(e) => setNested('channels', { email: e.target.checked })} /> {t('settings:notifications.channelEmail')}</label>
              <label><input type="checkbox" checked={form.channels.webhook} onChange={(e) => setNested('channels', { webhook: e.target.checked })} /> {t('settings:notifications.channelWebhook')}</label>
            </div>
            {form.channels.email && <p className="hint">{t('settings:notifications.emailHint')}</p>}
            {form.channels.webhook && (
              <div className="form-grid">
                <div className="field">
                  <label>{t('settings:notifications.webhookUrl')}</label>
                  <input type="url" value={form.webhook.url} onChange={(e) => setNested('webhook', { url: e.target.value })} placeholder="https://your-whatsapp-provider.example/send" required />
                </div>
                <div className="field">
                  <label>{t('settings:notifications.headers')}</label>
                  <textarea rows={2} value={editing.headersText} onChange={(e) => setEditing((ed) => ({ ...ed, headersText: e.target.value }))} style={{ fontFamily: 'monospace', fontSize: '0.82rem' }} />
                </div>
              </div>
            )}

            <h4 className="drawer-section-title">{t('settings:notifications.content')}</h4>
            <div className="field">
              <label>{t('settings:notifications.title')}</label>
              <input ref={titleRef} value={form.content.title} onFocus={() => setActiveTemplate('title')} onChange={(e) => setNested('content', { title: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('settings:notifications.message')}</label>
              <textarea ref={messageRef} rows={3} value={form.content.message} onFocus={() => setActiveTemplate('message')} onChange={(e) => setNested('content', { message: e.target.value })} />
            </div>
            <div className="placeholder-group-label">{activeTemplate === 'title' ? t('settings:notifications.insertIntoTitle') : t('settings:notifications.insertIntoMessage')}</div>
            <div className="placeholder-chips">
              {NOTIFICATION_VARIABLES.map((v) => (
                <button type="button" key={v.path} className="placeholder-chip" title={`{{${v.path}}}`} onClick={() => insertVariable(v.path)}>{t(`settings:notifications.variables.${v.labelKey}`)}</button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 0 }}>
              <Trans
                t={t}
                i18nKey="settings:notifications.anyLeadField"
                values={{ example1: '{{budgetMax}}', example2: '{{customFields.unitNumber}}' }}
                components={{ code1: CODE, code2: CODE }}
              />
            </p>
            <div className="notification-preview">
              <div className="hint">{t('settings:notifications.preview')}</div>
              <strong>{previewText(form.content.title)}</strong>
              <div>{previewText(form.content.message)}</div>
            </div>

            <div className="drawer-footer">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: 'auto' }}>
                <input type="checkbox" checked={form.isEnabled} onChange={(e) => setForm({ isEnabled: e.target.checked })} /> {t('settings:notifications.enabled')}
              </label>
              <button className="primary" type="submit" disabled={busy}>{busy ? t('common:actions.saving') : editing.ruleId ? t('settings:notifications.saveRule') : t('settings:notifications.createRule')}</button>
              <button type="button" className="secondary" onClick={() => setEditing(null)}>{t('common:actions.cancel')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
