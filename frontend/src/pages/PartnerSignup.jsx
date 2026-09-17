import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { COMMON_TIMEZONES, detectBrowserTimezone } from '../utils/timezone';

const initialForm = {
  name: '', mobile: '', email: '', username: '', password: '',
  companyName: '', city: '', state: '', timezone: detectBrowserTimezone()
};

export default function PartnerSignup() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(form);
      navigate('/my-leads');
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 460 }}>
      <h1>Channel Partner Registration</h1>
      <p className="hint">Create your account to start registering and managing your own leads.</p>
      <form className="card" onSubmit={handleSubmit}>
        {error && <div className="error-box">{error}</div>}

        <div className="field">
          <label>Channel Partner Name *</label>
          <input value={form.name} onChange={update('name')} required />
        </div>
        <div className="field">
          <label>Mobile Number *</label>
          <input value={form.mobile} onChange={update('mobile')} required placeholder="+91XXXXXXXXXX" />
        </div>
        <div className="field">
          <label>Email *</label>
          <input type="email" value={form.email} onChange={update('email')} required />
        </div>
        <div className="field">
          <label>Username *</label>
          <input value={form.username} onChange={update('username')} required />
        </div>
        <div className="field">
          <label>Password * (min 8 characters)</label>
          <input type="password" value={form.password} onChange={update('password')} required minLength={8} />
        </div>

        <div className="field">
          <label>Company / Organisation Name</label>
          <input value={form.companyName} onChange={update('companyName')} />
        </div>
        <div className="field">
          <label>City</label>
          <input value={form.city} onChange={update('city')} />
        </div>
        <div className="field">
          <label>State</label>
          <input value={form.state} onChange={update('state')} />
        </div>
        <div className="field">
          <label>Timezone</label>
          <select value={form.timezone} onChange={update('timezone')}>
            {(COMMON_TIMEZONES.includes(form.timezone) ? COMMON_TIMEZONES : [form.timezone, ...COMMON_TIMEZONES]).map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Creating account...' : 'Register'}
        </button>
        <p className="hint" style={{ marginTop: '1rem' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
