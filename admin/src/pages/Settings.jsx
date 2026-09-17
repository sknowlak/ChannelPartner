import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../api/client';

const MATCH_FIELD_OPTIONS = ['mobile', 'email'];
const VISIBILITY_LEVELS = ['FULL', 'LIMITED', 'NONE'];

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    getSettings()
      .then(({ data }) => setSettings(data))
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  useEffect(load, []);

  const toggleMatchField = (field) => {
    setSettings((s) => {
      const has = s.duplicateMatchFields.includes(field);
      return {
        ...s,
        duplicateMatchFields: has
          ? s.duplicateMatchFields.filter((f) => f !== field)
          : [...s.duplicateMatchFields, field]
      };
    });
  };

  const setVisibility = (field, phase, level) => {
    setSettings((s) => ({
      ...s,
      fieldVisibility: {
        ...s.fieldVisibility,
        [field]: { ...s.fieldVisibility[field], [phase]: level }
      }
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { data } = await updateSettings({
        duplicateProtectionDays: Number(settings.duplicateProtectionDays),
        duplicateMatchFields: settings.duplicateMatchFields,
        fieldVisibility: settings.fieldVisibility
      });
      setSettings(data);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !settings) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!settings) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <h1>Settings</h1>
      <p className="hint">Changes here apply immediately to every new registration and builder view - no redeploy needed.</p>
      {error && <div className="error-box">{error}</div>}
      {saved && <div className="card" style={{ background: '#e1f5e5', color: '#1a7f3c' }}>Settings saved.</div>}

      <form onSubmit={handleSave}>
        <div className="card">
          <h3>Duplicate Protection Window</h3>
          <div className="field" style={{ maxWidth: 200 }}>
            <label>Protection Days</label>
            <input
              type="number"
              min={1}
              value={settings.duplicateProtectionDays}
              onChange={(e) => setSettings((s) => ({ ...s, duplicateProtectionDays: e.target.value }))}
            />
          </div>

          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#444' }}>Duplicate Match Fields</label>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem' }}>
            {MATCH_FIELD_OPTIONS.map((field) => (
              <label key={field} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={settings.duplicateMatchFields.includes(field)}
                  onChange={() => toggleMatchField(field)}
                />
                {field}
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Field-Level Builder Visibility</h3>
          <table>
            <thead>
              <tr><th>Field</th><th>Before Booking</th><th>After Booking</th></tr>
            </thead>
            <tbody>
              {Object.entries(settings.fieldVisibility).map(([field, rule]) => (
                <tr key={field}>
                  <td>{field}</td>
                  <td>
                    <select value={rule.builderBeforeBooking} onChange={(e) => setVisibility(field, 'builderBeforeBooking', e.target.value)}>
                      {VISIBILITY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={rule.builderAfterBooking} onChange={(e) => setVisibility(field, 'builderAfterBooking', e.target.value)}>
                      {VISIBILITY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save Settings'}</button>
      </form>
    </div>
  );
}
