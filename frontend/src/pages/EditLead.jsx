import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { getMyRegistration, listLeadFields, updateMyRegistration } from '../api/client';
import DynamicFieldInput from '../components/DynamicFieldInput';
import { PERMISSIONS } from '../utils/permissions';
import { useAuth } from '../context/AuthContext';
import { sortLeadTabs } from '../utils/leadTabs';
import { findFieldErrors, focusField } from '../utils/formValidation';
import { useDataLabels } from '../i18n/dataLabels';

function valueFor(def, registration, customer) {
  if (def.scope === 'customer') return customer?.[def.fieldKey] ?? '';
  if (def.scope === 'registration') return registration[def.fieldKey] ?? '';
  return registration.customFields?.[def.fieldKey] ?? '';
}

// The edit counterpart to RegisterLead.jsx (section 39) - same tabbed form,
// pre-filled from GET /my/registrations/:id and saved via PATCH instead of
// POST. Unlike create, values are sent flat (not nested under `customer`) -
// updateMyRegistration on the backend reads req.body[fieldKey] directly
// regardless of scope, splitting it out server-side.
export default function EditLead() {
  const { registrationId } = useParams();
  const { hasPermission, partner } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation(['leads', 'common']);
  const { fieldLabel, groupLabel } = useDataLabels();
  const [fieldDefs, setFieldDefs] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [values, setValues] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState(new Map());

  useEffect(() => {
    Promise.all([listLeadFields(), getMyRegistration(registrationId)])
      .then(([{ data: fieldData }, { data: detail }]) => {
        const enabled = fieldData.definitions.filter((d) => d.isEnabled);
        setFieldDefs(enabled);
        setActiveTab(sortLeadTabs([...new Set(enabled.map((d) => d.group))])[0]);
        const initial = {};
        for (const def of enabled) initial[def.fieldKey] = valueFor(def, detail.registration, detail.customer);
        setValues(initial);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, [registrationId]);

  const setValue = (fieldKey, val) => {
    setValues((v) => ({ ...v, [fieldKey]: val }));
    setFieldErrors((m) => {
      if (!m.has(fieldKey)) return m;
      const next = new Map(m);
      next.delete(fieldKey);
      return next;
    });
  };

  const goToField = (fieldKey) => {
    const def = fieldDefs.find((d) => d.fieldKey === fieldKey);
    if (def) setActiveTab(def.group);
    focusField(fieldKey);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const errs = findFieldErrors(fieldDefs, values);
    if (errs.length > 0) {
      setFieldErrors(new Map(errs.map((e) => [e.fieldKey, e.message])));
      setError(t('common:states.fieldNeedsAttention', { count: errs.length }));
      goToField(errs[0].fieldKey);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {};
      for (const def of fieldDefs) {
        const val = values[def.fieldKey];
        if (val === undefined) continue;
        payload[def.fieldKey] = (def.dataType === 'NUMBER' || def.dataType === 'CURRENCY') && val !== '' ? Number(val) : val;
      }
      await updateMyRegistration(registrationId, payload);
      navigate(`/registrations/${registrationId}`);
    } catch (err) {
      const data = err.response?.data;
      if (data?.fieldKey) {
        setFieldErrors(new Map([[data.fieldKey, data.reason]]));
        setError(data.reason);
        goToField(data.fieldKey);
      } else {
        setError(data?.reason || err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasPermission(PERMISSIONS.MANAGE_LEADS)) {
    return (
      <div className="page page-wide">
        <div className="error-box">{t('leads:form.noPermissionEdit')}</div>
      </div>
    );
  }

  if (error && !fieldDefs) return <div className="page page-wide"><div className="error-box">{error}</div></div>;
  if (!fieldDefs || !values) return <div className="page page-wide">{t('common:states.loading')}</div>;

  const tabs = sortLeadTabs([...new Set(fieldDefs.map((d) => d.group))]);

  return (
    <div className="page page-wide">
      <h1>{t('leads:form.editTitle')}</h1>
      {error && <div className="error-box">{error}</div>}

      <form className="card" onSubmit={handleSubmit} noValidate>
        <div className="status-tabs">
          {tabs.map((tab) => {
            const tabHasError = fieldDefs.some((d) => d.group === tab && fieldErrors.has(d.fieldKey));
            return (
              <button
                type="button"
                key={tab}
                className={`${activeTab === tab ? 'active' : ''} ${tabHasError ? 'has-error' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tabHasError && <span className="dot error-dot" />}
                {groupLabel(tab)}
              </button>
            );
          })}
        </div>

        {tabs.map((tab) => {
          const tabFields = fieldDefs.filter((d) => d.group === tab);
          const columns = [];
          for (let i = 0; i < tabFields.length; i += 4) columns.push(tabFields.slice(i, i + 4));
          return (
            <div key={tab} className="edit-form-sections" style={{ display: activeTab === tab ? 'grid' : 'none' }}>
              {columns.map((col, i) => (
                <div key={i}>
                  {col.map((def) => (
                    <div className={`field ${fieldErrors.has(def.fieldKey) ? 'invalid' : ''}`} key={def.fieldKey} id={`field-${def.fieldKey}`}>
                      <label>{fieldLabel(def)}{def.isRequired ? ' *' : ''}</label>
                      <DynamicFieldInput def={def} value={values[def.fieldKey]} onChange={(val) => setValue(def.fieldKey, val)} currency={partner?.currency} />
                      {fieldErrors.has(def.fieldKey) && <span className="field-error">{fieldErrors.get(def.fieldKey)}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}

        <div className="edit-form-footer">
          <div className="meta" />
          <div className="actions">
            <button className="secondary" type="button" onClick={() => navigate(`/registrations/${registrationId}`)}>{t('common:actions.cancel')}</button>
            <button className="primary" type="submit" disabled={submitting}>
              {submitting ? t('common:actions.saving') : t('common:actions.save')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
