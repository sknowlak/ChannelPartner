import { useEffect, useState } from 'react';
import { createLeadField, deleteLeadField, getMyProfile, listLeadFields, updateLeadField } from '../api/client';
import { PERMISSIONS } from '../utils/permissions';
import SettingsCategories from '../components/SettingsCategories';
import LeadSettingsTabs from '../components/LeadSettingsTabs';

const DATA_TYPES = ['TEXT', 'TEXTAREA', 'NUMBER', 'CURRENCY', 'DATE', 'SELECT', 'LIST'];
const initialForm = { label: '', group: 'Additional Info', dataType: 'TEXT', options: '', isRequired: false };

export default function LeadSettings() {
  const [definitions, setDefinitions] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);

  const load = () => {
    Promise.all([listLeadFields(), getMyProfile()])
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
      await updateLeadField(def.fieldKey, { [key]: !def[key] });
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
      await createLeadField({
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
      await deleteLeadField(fieldKey);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  return (
    <div className="page page-wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>Settings</h1>
          <p className="hint" style={{ margin: 0 }}>
            {canManageSettings
              ? 'Configure the lead capture form: enable/disable fields, mark them required, or add your own custom fields.'
              : "You don't have permission to manage settings."}
          </p>
        </div>
        {canManageSettings && (
          <button className="pill-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ Add Custom Field'}
          </button>
        )}
      </div>

      <SettingsCategories />
      <LeadSettingsTabs />

      {error && <div className="error-box">{error}</div>}

      {showForm && canManageSettings && (
        <form className="card" onSubmit={handleCreate}>
          <div className="form-grid">
            <div className="field">
              <label>Field Label</label>
              <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Group</label>
              <input value={form.group} onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))} placeholder="e.g. Enquiry Info" />
            </div>
            <div className="field">
              <label>Data Type</label>
              <select value={form.dataType} onChange={(e) => setForm((f) => ({ ...f, dataType: e.target.value }))}>
                {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {form.dataType === 'SELECT' && (
              <div className="field">
                <label>Options (comma separated)</label>
                <input value={form.options} onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))} />
              </div>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
            <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))} />
            Required - partners on your team must fill this in to register a lead
          </label>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create Field'}</button>
        </form>
      )}

      <div className="card">
        <table className="pro-table">
          <thead>
            <tr><th>Field</th><th>Group</th><th>Type</th><th>Required</th><th>Enabled</th><th>Kind</th>{canManageSettings && <th>Actions</th>}</tr>
          </thead>
          <tbody>
            {definitions && definitions.map((def) => (
              <tr key={def.fieldKey}>
                <td>
                  <div className="primary-cell">{def.label}</div>
                  <div className="secondary-cell">{def.fieldKey}</div>
                </td>
                <td>{def.group}</td>
                <td>{def.dataType}</td>
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
                <td>{def.isCustom ? 'Custom' : def.isCore ? 'Core (locked)' : 'Standard'}</td>
                {canManageSettings && (
                  <td>{def.isCustom && <button className="danger" onClick={() => handleDelete(def.fieldKey)}>Delete</button>}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!definitions && !error && <p className="hint">Loading...</p>}
      </div>
    </div>
  );
}
