import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMyRegistration, listLeadFields } from '../api/client';
import DynamicFieldInput from '../components/DynamicFieldInput';
import { PERMISSIONS } from '../utils/permissions';
import { useAuth } from '../context/AuthContext';
import { sortLeadTabs } from '../utils/leadTabs';
import { findFieldErrors, focusField } from '../utils/formValidation';

// The authenticated counterpart to PartnerRegistration.jsx (Screen 1) - no
// partnerId field, since it's implicit from the logged-in session (spec
// section 31). Rendered entirely from this partner's LeadFieldDefinition
// list (sections 36, 39) as a tabbed form (Lead Info / Enquiry Info /
// Additional Info / Others / Notes) - enabling/disabling/requiring a field,
// or adding a custom one, changes this form immediately with no code change.
export default function RegisterLead() {
  const { hasPermission, partner } = useAuth();
  const [fieldDefs, setFieldDefs] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState(new Map());
  const navigate = useNavigate();

  useEffect(() => {
    listLeadFields()
      .then(({ data }) => {
        const enabled = data.definitions.filter((d) => d.isEnabled);
        setFieldDefs(enabled);
        setActiveTab((t) => t || sortLeadTabs([...new Set(enabled.map((d) => d.group))])[0]);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, []);

  const setValue = (fieldKey, val) => {
    setValues((v) => ({ ...v, [fieldKey]: val }));
    setFieldErrors((m) => {
      if (!m.has(fieldKey)) return m;
      const next = new Map(m);
      next.delete(fieldKey);
      return next;
    });
  };

  // Jumps the form to whichever field is the problem - switches to its tab,
  // marks it invalid, and scrolls/focuses it - instead of leaving the user
  // to guess which of several tabs holds the field a generic error refers to.
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
      setError(`${errs.length === 1 ? 'A field needs' : `${errs.length} fields need`} your attention - see below.`);
      goToField(errs[0].fieldKey);
      return;
    }

    setSubmitting(true);
    try {
      const customer = {};
      const payload = {};
      for (const def of fieldDefs) {
        const val = values[def.fieldKey];
        if (val === undefined || val === '') continue;
        if (def.scope === 'customer') customer[def.fieldKey] = val;
        else payload[def.fieldKey] = (def.dataType === 'NUMBER' || def.dataType === 'CURRENCY') ? Number(val) : val;
      }

      const { data } = await createMyRegistration({ ...payload, customer });
      navigate(`/registrations/result`, { state: { result: data } });
    } catch (err) {
      const data = err.response?.data;
      if (data?.fieldKey) {
        // Server rejected a field the client thought was fine (e.g. a
        // second browser tab changed what's required in between) - handle
        // it exactly like a client-side miss rather than bouncing away.
        setFieldErrors(new Map([[data.fieldKey, data.reason]]));
        setError(data.reason);
        goToField(data.fieldKey);
      } else if (data?.reasonCode) {
        // An actual business outcome (duplicate protection etc.), not a
        // form-validation problem - this is what the Result screen is for.
        navigate(`/registrations/result`, { state: { result: data } });
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
        <div className="error-box">You don't have permission to register leads.</div>
      </div>
    );
  }

  if (error && !fieldDefs) return <div className="page page-wide"><div className="error-box">{error}</div></div>;
  if (!fieldDefs) return <div className="page page-wide">Loading...</div>;

  const tabs = sortLeadTabs([...new Set(fieldDefs.map((d) => d.group))]);

  return (
    <div className="page page-wide">
      <h1>Add Lead</h1>
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
                {tab}
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
                      <label>{def.label}{def.isRequired ? ' *' : ''}</label>
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
            <button className="secondary" type="button" onClick={() => navigate('/my-leads')}>Cancel</button>
            <button className="primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
