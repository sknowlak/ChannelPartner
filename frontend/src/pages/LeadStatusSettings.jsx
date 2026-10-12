import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createLeadStatus, deleteLeadStatus, getMyProfile, listLeadFields, listLeadStatuses, updateLeadStatus
} from '../api/client';
import { PERMISSIONS } from '../utils/permissions';
import { useDataLabels } from '../i18n/dataLabels';
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
  const { t } = useTranslation(['settings', 'common']);
  const { fieldLabel, statusLabel, subStatusLabel } = useDataLabels();
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

  const labelFor = (key) => {
    const def = fieldDefs.find((d) => d.fieldKey === key);
    return def ? fieldLabel(def) : key;
  };

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
    if (!window.confirm(t('settings:statuses.deleteConfirm', { name: statusLabel(status.name) }))) return;
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
          <h1 style={{ marginBottom: '0.2rem' }}>{t('settings:page.title')}</h1>
          <p className="hint" style={{ margin: 0 }}>
            {t('settings:statuses.intro')}
          </p>
        </div>
        {canManage && <button className="pill-primary" onClick={() => setEditing({ form: emptyStatus() })}>{t('settings:statuses.add')}</button>}
      </div>

      <SettingsCategories />
      <LeadSettingsTabs />

      {error && !editing && <div className="error-box">{error}</div>}

      <div className="card">
        <table className="pro-table">
          <thead>
            <tr>
              <th>{t('settings:statuses.columns.order')}</th><th>{t('settings:statuses.columns.status')}</th><th>{t('settings:statuses.columns.subStatuses')}</th>
              <th>{t('settings:statuses.columns.asksFor')}</th><th>{t('settings:statuses.columns.active')}</th>{canManage && <th>{t('common:fields.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {statuses && statuses.map((s, i) => {
              const scheduled = s.subStatuses.filter((x) => x.requiresSchedule).map((x) => subStatusLabel(x.name));
              return (
                <tr key={s.statusId} className={s.isActive ? '' : 'row-muted'}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canManage && (
                      <>
                        <button className="order-btn" disabled={i === 0} onClick={() => move(i, -1)} title={t('settings:statuses.moveUp')}>▲</button>
                        <button className="order-btn" disabled={i === statuses.length - 1} onClick={() => move(i, 1)} title={t('settings:statuses.moveDown')}>▼</button>
                      </>
                    )}
                  </td>
                  <td>
                    <div className="primary-cell"><span className="status-dot" style={{ background: s.color }} />{statusLabel(s.name)}</div>
                    <div className="status-flags">
                      {s.isDefault && <span className="badge accepted">{t('settings:statuses.defaultBadge')}</span>}
                      {s.isBooking && <span className="badge pending">{t('settings:statuses.bookingBadge')}</span>}
                    </div>
                  </td>
                  <td>
                    <div className="chip-list">
                      {s.subStatuses.map((x) => (
                        <span key={x.subStatusId} className={`chip ${x.isActive ? '' : 'muted'}`} title={x.requiresSchedule ? (x.scheduleLabel ? t('settings:statuses.asksForLabel', { label: x.scheduleLabel }) : t('settings:statuses.asksForDateTime')) : ''}>
                          {subStatusLabel(x.name)}{x.requiresSchedule && ' 🕒'}
                        </span>
                      ))}
                      {s.subStatuses.length === 0 && <span className="hint">{t('settings:statuses.none')}</span>}
                    </div>
                  </td>
                  <td className="secondary-cell">
                    {s.requiresSchedule && <div>🕒 {s.scheduleLabel || t('settings:statuses.dateTime')}</div>}
                    {scheduled.length > 0 && <div>🕒 {t('settings:statuses.scheduledOn', { names: scheduled.join(', ') })}</div>}
                    {s.fields.length > 0 && (
                      <div title={s.fields.map((f) => `${labelFor(f.fieldKey)}${f.isRequired ? ' *' : ''}`).join(', ')}>
                        {t('settings:statuses.fieldsSummary', { count: s.fields.length, mandatory: s.fields.filter((f) => f.isRequired).length })}
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
                      <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => setEditing({ statusId: s.statusId, form: toForm(s) })}>{t('common:actions.edit')}</button>
                      {!s.isDefault && <button className="danger" onClick={() => remove(s)}>{t('common:actions.delete')}</button>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!statuses && !error && <p className="hint">{t('common:states.loading')}</p>}
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => !busy && setEditing(null)}>
          <form className="modal-card card status-editor" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{editing.statusId
                ? t('settings:statuses.editTitle', { name: statusLabel(statuses.find((s) => s.statusId === editing.statusId)?.name) })
                : t('settings:statuses.newTitle')}</h3>
              <button type="button" className="link" onClick={() => setEditing(null)}>{t('common:actions.close')}</button>
            </div>
            {error && <div className="error-box">{error}</div>}

            <div className="form-grid">
              <div className="field">
                <label>{t('settings:statuses.name')}</label>
                <input value={form.name} onChange={(e) => setForm({ name: e.target.value })} required autoFocus />
              </div>
              <div className="field">
                <label>{t('settings:statuses.colour')}</label>
                <input type="color" value={form.color} onChange={(e) => setForm({ color: e.target.value })} style={{ height: '2.4rem', padding: '0.2rem' }} />
              </div>
            </div>

            <div className="check-row">
              <label><input type="checkbox" checked={form.isActive} disabled={form.isDefault} onChange={(e) => setForm({ isActive: e.target.checked })} /> {t('settings:statuses.active')}</label>
              <label><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ isDefault: e.target.checked, isActive: e.target.checked ? true : form.isActive })} /> {t('settings:statuses.isDefault')}</label>
              <label><input type="checkbox" checked={form.isBooking} onChange={(e) => setForm({ isBooking: e.target.checked })} /> {t('settings:statuses.isBooking')}</label>
            </div>

            <h4 className="drawer-section-title">{t('settings:statuses.whenMoved')}</h4>
            <div className="check-row">
              <label><input type="checkbox" checked={form.requiresSchedule} onChange={(e) => setForm({ requiresSchedule: e.target.checked })} /> {t('settings:statuses.askSchedule')}</label>
              {form.requiresSchedule && (
                <input value={form.scheduleLabel} onChange={(e) => setForm({ scheduleLabel: e.target.value })} placeholder={t('settings:statuses.scheduleLabelPlaceholder')} style={{ maxWidth: '16rem' }} />
              )}
            </div>
            <label className="field-label">{t('settings:statuses.fieldsToShow')}</label>
            <StatusFieldsPicker fieldDefs={fieldDefs} value={form.fields} onChange={(fields) => setForm({ fields })} />

            <h4 className="drawer-section-title">{t('settings:statuses.subStatusesTitle')}</h4>
            <p className="hint" style={{ marginTop: 0 }}>
              {t('settings:statuses.subStatusesHint')}
            </p>
            {form.subStatuses.map((sub, i) => (
              <div key={sub.key} className="sub-status-editor">
                <div className="sub-status-row">
                  <span className="order-btns">
                    <button type="button" className="order-btn" disabled={i === 0} onClick={() => moveSub(i, -1)}>▲</button>
                    <button type="button" className="order-btn" disabled={i === form.subStatuses.length - 1} onClick={() => moveSub(i, 1)}>▼</button>
                  </span>
                  <input value={sub.name} onChange={(e) => setSub(sub.key, { name: e.target.value })} placeholder={t('settings:statuses.subStatusName')} required />
                  <label><input type="checkbox" checked={sub.isActive} onChange={(e) => setSub(sub.key, { isActive: e.target.checked })} /> {t('settings:statuses.active')}</label>
                  <label><input type="checkbox" checked={sub.requiresSchedule} onChange={(e) => setSub(sub.key, { requiresSchedule: e.target.checked })} /> {t('settings:statuses.dateTime')}</label>
                  <button type="button" className="secondary" onClick={() => setSub(sub.key, { open: !sub.open })}>
                    {t('settings:statuses.subFields', { count: sub.fields.length })}{sub.open ? ' ▴' : ' ▾'}
                  </button>
                  <button type="button" className="danger" onClick={() => setForm((f) => ({ subStatuses: f.subStatuses.filter((s) => s.key !== sub.key) }))}>{t('common:actions.remove')}</button>
                </div>
                {sub.requiresSchedule && (
                  <input className="sub-status-schedule" value={sub.scheduleLabel} onChange={(e) => setSub(sub.key, { scheduleLabel: e.target.value })} placeholder={t('settings:statuses.subScheduleLabelPlaceholder')} />
                )}
                {sub.open && <StatusFieldsPicker fieldDefs={fieldDefs} value={sub.fields} onChange={(fields) => setSub(sub.key, { fields })} />}
              </div>
            ))}
            <button type="button" className="secondary" onClick={() => setForm((f) => ({ subStatuses: [...f.subStatuses, { ...emptySub(), open: false }] }))}>{t('settings:statuses.addSubStatus')}</button>

            <div className="drawer-footer">
              <button className="primary" type="submit" disabled={busy}>{busy ? t('common:actions.saving') : editing.statusId ? t('settings:statuses.saveStatus') : t('settings:statuses.createStatus')}</button>
              <button type="button" className="secondary" onClick={() => setEditing(null)}>{t('common:actions.cancel')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
