import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { COMMON_TIMEZONES, detectBrowserTimezone } from '../utils/timezone';
import { COMMON_CURRENCIES } from '../utils/currency';
import PhoneInput from '../components/PhoneInput';
import { validateMobile } from '../utils/phone';
import { focusField } from '../utils/formValidation';

const initialForm = {
  name: '', mobile: '', email: '', username: '', password: '',
  companyName: '', city: '', state: '', timezone: detectBrowserTimezone(), currency: 'USD'
};

export default function PartnerSignup() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState(null);
  const [mobileError, setMobileError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { register } = useAuth();
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

    setBusy(true);
    try {
      await register(form);
      navigate('/my-leads');
    } catch (err) {
      const data = err.response?.data;
      if (data?.fieldKey === 'mobile') {
        setMobileError(data.reason);
        setError(data.reason);
        focusField('mobile');
      } else {
        setError(data?.reason || err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-wide">
      <h1>Channel Partner Registration</h1>
      <p className="hint">Create your account to start registering and managing your own leads.</p>
      {error && <div className="error-box">{error}</div>}

      <form className="card" onSubmit={handleSubmit} noValidate>
        <div className="edit-form-sections">
          <div>
            <h3 className="form-section-title"><span>Account Details</span></h3>
            <div className="field">
              <label>Channel Partner Name *</label>
              <input value={form.name} onChange={update('name')} required />
            </div>
            <div className={`field ${mobileError ? 'invalid' : ''}`} id="field-mobile">
              <label>Mobile Number *</label>
              <PhoneInput
                value={form.mobile}
                onChange={(val) => { setForm((f) => ({ ...f, mobile: val })); setMobileError(null); }}
                required
              />
              {mobileError && <span className="field-error">{mobileError}</span>}
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
          </div>

          <div>
            <h3 className="form-section-title"><span>Organisation Details</span></h3>
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
            <div className="field">
              <label>Currency</label>
              <select value={form.currency} onChange={update('currency')}>
                {COMMON_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="edit-form-footer">
          <p className="hint" style={{ margin: 0 }}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
          <div className="actions">
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Creating account...' : 'Register'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
