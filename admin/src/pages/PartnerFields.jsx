import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createFieldDefinition,
  deleteFieldDefinition,
  listFieldDefinitions,
  updateFieldDefinition
} from '../api/client';
import { errorMessage } from '../utils/errors';
import { enumLabel } from '../i18n/enumLabels';
import { useDataLabels } from '../i18n/dataLabels';

const DATA_TYPES = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'LIST'];

export default function PartnerFields() {
  const { t } = useTranslation(['partnerFields', 'common', 'enums']);
  const { fieldLabel, groupLabel } = useDataLabels();
  const [definitions, setDefinitions] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fieldKey: '', label: '', group: 'Custom', dataType: 'TEXT', options: '', isRequired: false });
  const [busy, setBusy] = useState(false);

  const load = () => {
    listFieldDefinitions()
      .then(({ data }) => setDefinitions(data.definitions))
      .catch((err) => setError(errorMessage(err)));
  };

  useEffect(load, []);

  const toggle = async (def, key) => {
    try {
      await updateFieldDefinition(def.fieldKey, { [key]: !def[key] });
      load();
    } catch (err) {
      setError(errorMessage(err));
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
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (fieldKey) => {
    try {
      await deleteFieldDefinition(fieldKey);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>{t('partnerFields:title')}</h1>
        <button className="primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? t('common:actions.cancel') : t('partnerFields:addCustomField')}
        </button>
      </div>
      <p className="hint">{t('partnerFields:hint')}</p>

      {error && <div className="error-box">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <div className="field">
            <label htmlFor="new-field-fieldKey">{t('partnerFields:form.fieldKey')}</label>
            <input id="new-field-fieldKey" value={form.fieldKey} onChange={(e) => setForm((f) => ({ ...f, fieldKey: e.target.value }))} required />
          </div>
          <div className="field">
            <label htmlFor="new-field-label">{t('partnerFields:form.label')}</label>
            <input id="new-field-label" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required />
          </div>
          <div className="field">
            <label htmlFor="new-field-group">{t('partnerFields:form.group')}</label>
            <input id="new-field-group" value={form.group} onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="new-field-dataType">{t('partnerFields:form.dataType')}</label>
            <select id="new-field-dataType" value={form.dataType} onChange={(e) => setForm((f) => ({ ...f, dataType: e.target.value }))}>
              {DATA_TYPES.map((dt) => <option key={dt} value={dt}>{enumLabel('dataType', dt)}</option>)}
            </select>
          </div>
          {form.dataType === 'SELECT' && (
            <div className="field">
              <label htmlFor="new-field-options">{t('partnerFields:form.options')}</label>
              <input id="new-field-options" value={form.options} onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))} />
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
            <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))} />
            {t('partnerFields:form.required')}
          </label>
          <button className="primary" type="submit" disabled={busy}>{busy ? t('partnerFields:form.creating') : t('partnerFields:form.create')}</button>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              {['field', 'group', 'type', 'required', 'enabled', 'custom'].map((k) => <th key={k}>{t(`partnerFields:columns.${k}`)}</th>)}
              <th><span className="visually-hidden">{t('partnerFields:columns.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {definitions.map((def) => (
              <tr key={def.fieldKey}>
                <td>{fieldLabel(def)}<div className="hint">{def.fieldKey}</div></td>
                <td>{groupLabel(def.group)}</td>
                <td>{enumLabel('dataType', def.dataType)}</td>
                <td>
                  <input type="checkbox" checked={def.isRequired} disabled={def.isSystemGenerated} onChange={() => toggle(def, 'isRequired')} aria-label={t('partnerFields:toggleRequired', { field: fieldLabel(def) })} />
                </td>
                <td>
                  <input type="checkbox" checked={def.isEnabled} onChange={() => toggle(def, 'isEnabled')} aria-label={t('partnerFields:toggleEnabled', { field: fieldLabel(def) })} />
                </td>
                <td>{def.isCustom ? t('partnerFields:kind.custom') : def.isSystemGenerated ? t('partnerFields:kind.system') : t('partnerFields:kind.standard')}</td>
                <td>
                  {def.isCustom && <button className="danger" onClick={() => handleDelete(def.fieldKey)}>{t('common:actions.delete')}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
