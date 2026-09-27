import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerCustomer } from '../api/client';
import PhoneInput from '../components/PhoneInput';
import { validateMobile } from '../utils/phone';
import { focusField } from '../utils/formValidation';

const initialForm = {
  partnerId: 'PARTNER-001',
  projectId: 'PROJECT-A',
  name: '',
  mobile: '',
  email: '',
  externalReferenceId: '',
  source: 'SIMULATED_EXTERNAL_CRM'
};

export default function PartnerRegistration() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [mobileError, setMobileError] = useState(null);
  const navigate = useNavigate();

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const mobileCheck = validateMobile(form.mobile);
    if (!mobileCheck.valid) {
      setMobileError(mobileCheck.reason);
      setError('A field needs your attention - see below.');
      focusField('mobile');
      return;
    }
    setMobileError(null);

    setSubmitting(true);
    try {
      const { data } = await registerCustomer({
        partnerId: form.partnerId,
        projectId: form.projectId,
        customer: { name: form.name, mobile: form.mobile, email: form.email },
        source: form.source,
        externalReferenceId: form.externalReferenceId || undefined
      });
      navigate(`/registrations/result`, { state: { result: data } });
    } catch (err) {
      const data = err.response?.data;
      if (data?.fieldKey === 'mobile') {
        setMobileError(data.reason);
        setError(data.reason);
        focusField('mobile');
      } else if (data?.reasonCode) {
        navigate(`/registrations/result`, { state: { result: data } });
      } else {
        setError(data?.reason || err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <h1>Screen 1 — Partner Registration</h1>
      {error && <div className="error-box">{error}</div>}
      <form className="card" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label>Partner</label>
          <input value={form.partnerId} onChange={update('partnerId')} required />
        </div>
        <div className="field">
          <label>Customer Name</label>
          <input value={form.name} onChange={update('name')} required />
        </div>
        <div className={`field ${mobileError ? 'invalid' : ''}`} id="field-mobile">
          <label>Mobile</label>
          <PhoneInput
            value={form.mobile}
            onChange={(val) => { setForm((f) => ({ ...f, mobile: val })); setMobileError(null); }}
            required
          />
          {mobileError && <span className="field-error">{mobileError}</span>}
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={form.email} onChange={update('email')} />
        </div>
        <div className="field">
          <label>Project</label>
          <input value={form.projectId} onChange={update('projectId')} required />
        </div>
        <div className="field">
          <label>External CRM Reference</label>
          <input value={form.externalReferenceId} onChange={update('externalReferenceId')} placeholder="CRM-12345" />
        </div>
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? 'Registering...' : 'Register Customer'}
        </button>
      </form>
    </div>
  );
}
