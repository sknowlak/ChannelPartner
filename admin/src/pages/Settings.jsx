import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSettings, updateSettings } from '../api/client';
import { errorMessage } from '../utils/errors';
import { enumLabel } from '../i18n/enumLabels';

const MATCH_FIELD_OPTIONS = ['mobile', 'email'];
// Display labels for the match-field keys (the keys themselves are saved).
const MATCH_FIELD_LABELS = { mobile: 'common:fields.mobile', email: 'common:fields.email' };
const VISIBILITY_LEVELS = ['FULL', 'LIMITED', 'NONE'];

export default function Settings() {
  const { t } = useTranslation(['settings', 'common', 'enums']);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    getSettings()
      .then(({ data }) => setSettings(data))
      .catch((err) => setError(errorMessage(err)));
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
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (error && !settings) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!settings) return <div className="page">{t('common:states.loading')}</div>;

  return (
    <div className="page">
      <h1>{t('settings:title')}</h1>
      <p className="hint">{t('settings:hint')}</p>
      {error && <div className="error-box">{error}</div>}
      {saved && <div className="card" style={{ background: '#e1f5e5', color: '#1a7f3c' }}>{t('settings:saved')}</div>}

      <form onSubmit={handleSave}>
        <div className="card">
          <h3>{t('settings:protection.title')}</h3>
          <div className="field" style={{ maxWidth: 200 }}>
            <label htmlFor="settings-protection-days">{t('settings:protection.days')}</label>
            <input
              id="settings-protection-days"
              type="number"
              min={1}
              value={settings.duplicateProtectionDays}
              onChange={(e) => setSettings((s) => ({ ...s, duplicateProtectionDays: e.target.value }))}
            />
          </div>

          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#444' }}>{t('settings:protection.matchFields')}</label>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem' }}>
            {MATCH_FIELD_OPTIONS.map((field) => (
              <label key={field} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={settings.duplicateMatchFields.includes(field)}
                  onChange={() => toggleMatchField(field)}
                />
                {t(MATCH_FIELD_LABELS[field])}
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>{t('settings:visibility.title')}</h3>
          <table>
            <thead>
              <tr><th>{t('settings:visibility.columns.field')}</th><th>{t('settings:visibility.columns.before')}</th><th>{t('settings:visibility.columns.after')}</th></tr>
            </thead>
            <tbody>
              {Object.entries(settings.fieldVisibility).map(([field, rule]) => (
                <tr key={field}>
                  {/* Field keys are configuration data - shown as stored. */}
                  <td>{field}</td>
                  <td>
                    <select aria-label={t('settings:visibility.beforeFor', { field })} value={rule.builderBeforeBooking} onChange={(e) => setVisibility(field, 'builderBeforeBooking', e.target.value)}>
                      {VISIBILITY_LEVELS.map((l) => <option key={l} value={l}>{enumLabel('visibility', l)}</option>)}
                    </select>
                  </td>
                  <td>
                    <select aria-label={t('settings:visibility.afterFor', { field })} value={rule.builderAfterBooking} onChange={(e) => setVisibility(field, 'builderAfterBooking', e.target.value)}>
                      {VISIBILITY_LEVELS.map((l) => <option key={l} value={l}>{enumLabel('visibility', l)}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="primary" type="submit" disabled={busy}>{busy ? t('common:actions.saving') : t('settings:save')}</button>
      </form>
    </div>
  );
}
