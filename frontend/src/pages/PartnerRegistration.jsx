import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerCustomer } from '../api/client';

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
  const navigate = useNavigate();

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
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
      if (err.response && err.response.data) {
        navigate(`/registrations/result`, { state: { result: err.response.data } });
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <h1>Screen 1 — Partner Registration</h1>
      {error && <div className="error-box">{error}</div>}
      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label>Partner</label>
          <input value={form.partnerId} onChange={update('partnerId')} required />
        </div>
        <div className="field">
          <label>Customer Name</label>
          <input value={form.name} onChange={update('name')} required />
        </div>
        <div className="field">
          <label>Mobile</label>
          <input value={form.mobile} onChange={update('mobile')} required placeholder="+91XXXXXXXXXX" />
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
