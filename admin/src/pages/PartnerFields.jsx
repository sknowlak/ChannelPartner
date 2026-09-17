import { useEffect, useState } from 'react';
import {
  createFieldDefinition,
  deleteFieldDefinition,
  listFieldDefinitions,
  updateFieldDefinition
} from '../api/client';

const DATA_TYPES = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'LIST'];

export default function PartnerFields() {
  const [definitions, setDefinitions] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fieldKey: '', label: '', group: 'Custom', dataType: 'TEXT', options: '', isRequired: false });
  const [busy, setBusy] = useState(false);

  const load = () => {
    listFieldDefinitions()
      .then(({ data }) => setDefinitions(data.definitions))
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  useEffect(load, []);

  const toggle = async (def, key) => {
    try {
      await updateFieldDefinition(def.fieldKey, { [key]: !def[key] });
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
      await createFieldDefinition({
        ...form,
        options: form.dataType === 'SELECT' ? form.options.split(',').map((o) => o.trim()).filter(Boolean) : []
      });
      setForm({ fieldKey: '', label: '', group: 'Custom', dataType: 'TEXT', options: '', isRequired: false });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (fieldKey) => {
    try {
      await deleteFieldDefinition(fieldKey);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Partner Field Settings</h1>
        <button className="primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add Custom Field'}
        </button>
      </div>
      <p className="hint">Enable/disable any field, mark it required, or add an entirely new field to the partner registration form.</p>

      {error && <div className="error-box">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <div className="field">
            <label>Field Key (no spaces, e.g. preferredLanguage)</label>
            <input value={form.fieldKey} onChange={(e) => setForm((f) => ({ ...f, fieldKey: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Label</label>
            <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Group</label>
            <input value={form.group} onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))} />
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
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
            <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))} />
            Required
          </label>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create Field'}</button>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr><th>Field</th><th>Group</th><th>Type</th><th>Required</th><th>Enabled</th><th>Custom</th><th></th></tr>
          </thead>
          <tbody>
            {definitions.map((def) => (
              <tr key={def.fieldKey}>
                <td>{def.label}<div className="hint">{def.fieldKey}</div></td>
                <td>{def.group}</td>
                <td>{def.dataType}</td>
                <td>
                  <input type="checkbox" checked={def.isRequired} disabled={def.isSystemGenerated} onChange={() => toggle(def, 'isRequired')} />
                </td>
                <td>
                  <input type="checkbox" checked={def.isEnabled} onChange={() => toggle(def, 'isEnabled')} />
                </td>
                <td>{def.isCustom ? 'Yes' : def.isSystemGenerated ? 'System' : 'Standard'}</td>
                <td>
                  {def.isCustom && <button className="danger" onClick={() => handleDelete(def.fieldKey)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
