import { useEffect, useState } from 'react';
import { getMyProfile, updateMyProfile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COMMON_TIMEZONES, detectBrowserTimezone, formatDateTime } from '../utils/timezone';
import { COMMON_CURRENCIES } from '../utils/currency';
import PhoneInput from '../components/PhoneInput';
import TeamTabs from '../components/TeamTabs';
import { validateMobile } from '../utils/phone';
import { focusField } from '../utils/formValidation';

export default function MyProfile() {
  const { partner, updateLocalPartner } = useAuth();
  const [form, setForm] = useState(null);
  const [role, setRole] = useState(partner.role || null);
  const [roleName, setRoleName] = useState(partner.roleName || '');
  const [error, setError] = useState(null);
  const [mobileError, setMobileError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMyProfile()
      .then(({ data }) => {
        setForm({ ...data.profile, password: '' });
        setRole(data.role); // sourced fresh, not the cached session (see ManageTeam.jsx)
        setRoleName(data.roleName);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, []);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (form.mobile) {
      const mobileCheck = validateMobile(form.mobile);
      if (!mobileCheck.valid) {
        setMobileError(mobileCheck.reason);
        setError('A field needs your attention - see below.');
        focusField('mobile');
        return;
      }
    }
    setMobileError(null);

    setBusy(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      const { data } = await updateMyProfile(payload);
      updateLocalPartner(data.profile);
      setForm({ ...data.profile, password: '' });
      setRole(data.role);
      setSaved(true);
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

  if (error && !form) return <div className="page page-wide"><div className="error-box">{error}</div></div>;
  if (!form) return <div className="page page-wide">Loading...</div>;

  const isOwner = role === 'OWNER';

  return (
    <div className="page page-wide">
      <h1>Manage Team</h1>
      <TeamTabs />
      {error && <div className="error-box">{error}</div>}
      {saved && <div className="card" style={{ background: '#e1f5e5', color: '#1a7f3c' }}>Profile updated.</div>}

      <form className="card" onSubmit={handleSubmit} noValidate>
        <div className="edit-form-sections">
          <div>
            <h3 className="form-section-title"><span>Basic Information</span></h3>
            <div className="field">
              <label>Name</label>
              <input value={form.name || ''} onChange={update('name')} required />
            </div>
            <div className={`field ${mobileError ? 'invalid' : ''}`} id="field-mobile">
              <label>Mobile</label>
              <PhoneInput
                value={form.mobile || ''}
                onChange={(val) => { setForm((f) => ({ ...f, mobile: val })); setMobileError(null); }}
              />
              {mobileError && <span className="field-error">{mobileError}</span>}
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email || ''} onChange={update('email')} />
            </div>
          </div>

          <div>
            <h3 className="form-section-title"><span>{isOwner ? 'Organisation Information' : 'Preferences'}</span></h3>
            {isOwner && (
              <>
                <div className="field">
                  <label>Company / Organisation Name</label>
                  <input value={form.companyName || ''} onChange={update('companyName')} />
                </div>
                <div className="field">
                  <label>City</label>
                  <input value={form.city || ''} onChange={update('city')} />
                </div>
                <div className="field">
                  <label>State</label>
                  <input value={form.state || ''} onChange={update('state')} />
                </div>
                <div className="field">
                  <label>Currency</label>
                  <select value={form.currency || 'USD'} onChange={update('currency')}>
                    {(COMMON_CURRENCIES.includes(form.currency) ? COMMON_CURRENCIES : [form.currency || 'USD', ...COMMON_CURRENCIES]).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <p className="hint" style={{ margin: '0.3rem 0 0' }}>Used to display budgets and booking values across your team.</p>
                </div>
              </>
            )}
            <div className="field">
              <label>Timezone</label>
              <select value={form.timezone || 'UTC'} onChange={update('timezone')}>
                {(COMMON_TIMEZONES.includes(form.timezone) ? COMMON_TIMEZONES : [form.timezone || 'UTC', ...COMMON_TIMEZONES]).map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
              <button
                type="button"
                className="secondary"
                style={{ marginTop: '0.4rem', alignSelf: 'flex-start' }}
                onClick={() => setForm((f) => ({ ...f, timezone: detectBrowserTimezone() }))}
              >
                Use device timezone ({detectBrowserTimezone()})
              </button>
            </div>
          </div>

          <div>
            <h3 className="form-section-title"><span>Security & Role</span></h3>
            <div className="field">
              <label>Role</label>
              <input value={roleName || (isOwner ? 'Owner' : 'Team Member')} disabled />
            </div>
            <div className="field">
              <label>New Password (leave blank to keep unchanged)</label>
              <input type="password" value={form.password} onChange={update('password')} minLength={8} />
            </div>
          </div>
        </div>

        <div className="edit-form-footer">
          <div className="meta">
            <span><strong>Username</strong>{partner.username}</span>
            <span><strong>Role</strong>{roleName || (isOwner ? 'Owner' : 'Team Member')}</span>
            {form.createdAt && <span><strong>Member Since</strong>{formatDateTime(form.createdAt, form.timezone)}</span>}
          </div>
          <div className="actions">
            <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
