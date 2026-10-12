import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createUserField, deleteUserField, getMyProfile, listUserFields, updateUserField } from '../api/client';
import { PERMISSIONS } from '../utils/permissions';
import { useDataLabels } from '../i18n/dataLabels';
import SettingsCategories from '../components/SettingsCategories';

const DATA_TYPES = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'SELECT', 'LIST'];
const initialForm = { label: '', group: 'Additional Details', dataType: 'TEXT', options: '', isRequired: false };

export default function UserSettings() {
  const { t } = useTranslation(['settings', 'common']);
  const { userFieldLabel, groupLabel } = useDataLabels();
  const [definitions, setDefinitions] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);

  const load = () => {
    Promise.all([listUserFields(), getMyProfile()])
      .then(([{ data }, { data: me }]) => {
        setDefinitions(data.definitions);
        setPermissions(me.permissions || []);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  useEffect(load, []);

  const canManageSettings = permissions.includes(PERMISSIONS.MANAGE_SETTINGS);

  const toggle = async (def, key) => {
    try {
      await updateUserField(def.fieldKey, { [key]: !def[key] });
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createUserField({
        ...form,
        options: form.dataType === 'SELECT' ? form.options.split(',').map((o) => o.trim()).filter(Boolean) : []
      });
      setForm(initialForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (fieldKey) => {
    setError(null);
    try {
      await deleteUserField(fieldKey);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  return (
    <div className="page page-wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>{t('settings:page.title')}</h1>
          <p className="hint" style={{ margin: 0 }}>
            {canManageSettings
              ? t('settings:fields.userIntro')
              : t('settings:page.noPermission')}
          </p>
        </div>
        {canManageSettings && (
          <button className="pill-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? t('common:actions.cancel') : t('settings:fields.addCustomField')}
          </button>
        )}
      </div>

      <SettingsCategories />

      {error && <div className="error-box">{error}</div>}

      {showForm && canManageSettings && (
        <form className="card" onSubmit={handleCreate}>
          <div className="form-grid">
            <div className="field">
              <label>{t('settings:fields.fieldLabel')}</label>
              <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required />
            </div>
            <div className="field">
              <label>{t('settings:fields.group')}</label>
              <input value={form.group} onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))} placeholder={t('settings:fields.groupPlaceholderUser')} />
            </div>
            <div className="field">
              <label>{t('settings:fields.dataType')}</label>
              <select value={form.dataType} onChange={(e) => setForm((f) => ({ ...f, dataType: e.target.value }))}>
                {DATA_TYPES.map((type) => <option key={type} value={type}>{t(`settings:dataTypes.${type}`)}</option>)}
              </select>
            </div>
            {form.dataType === 'SELECT' && (
              <div className="field">
                <label>{t('settings:fields.options')}</label>
                <input value={form.options} onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))} />
              </div>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
            <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))} />
            {t('settings:fields.requiredUser')}
          </label>
          <button className="primary" type="submit" disabled={busy}>{busy ? t('settings:fields.creating') : t('settings:fields.createField')}</button>
        </form>
      )}

      <div className="card">
        <table className="pro-table">
          <thead>
            <tr>
              <th>{t('settings:fields.columns.field')}</th><th>{t('settings:fields.columns.group')}</th><th>{t('settings:fields.columns.type')}</th>
              <th>{t('settings:fields.columns.required')}</th><th>{t('settings:fields.columns.enabled')}</th><th>{t('settings:fields.columns.kind')}</th>
              {canManageSettings && <th>{t('common:fields.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {definitions && definitions.map((def) => (
              <tr key={def.fieldKey}>
                <td>
                  <div className="primary-cell">{userFieldLabel(def)}</div>
                  <div className="secondary-cell">{def.fieldKey}</div>
                </td>
                <td>{groupLabel(def.group)}</td>
                <td>{t(`settings:dataTypes.${def.dataType}`, { defaultValue: def.dataType })}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={def.isRequired}
                    disabled={!canManageSettings || def.isCore}
                    onChange={() => toggle(def, 'isRequired')}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={def.isEnabled}
                    disabled={!canManageSettings || def.isCore}
                    onChange={() => toggle(def, 'isEnabled')}
                  />
                </td>
                <td>{def.isCustom ? t('settings:fields.kind.custom') : def.isCore ? t('settings:fields.kind.core') : t('settings:fields.kind.standard')}</td>
                {canManageSettings && (
                  <td>{def.isCustom && <button className="danger" onClick={() => handleDelete(def.fieldKey)}>{t('common:actions.delete')}</button>}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!definitions && !error && <p className="hint">{t('common:states.loading')}</p>}
      </div>
    </div>
  );
}
