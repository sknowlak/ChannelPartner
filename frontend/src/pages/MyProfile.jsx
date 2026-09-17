import { useEffect, useState } from 'react';
import { getMyProfile, updateMyProfile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COMMON_TIMEZONES, detectBrowserTimezone } from '../utils/timezone';

export default function MyProfile() {
  const { partner, updateLocalPartner } = useAuth();
  const [form, setForm] = useState(null);
  const [role, setRole] = useState(partner.role || null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMyProfile()
      .then(({ data }) => {
        setForm({ ...data.profile, password: '' });
        setRole(data.role); // sourced fresh, not the cached session (see ManageTeam.jsx)
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, []);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      const { data } = await updateMyProfile(payload);
      updateLocalPartner(data.profile);
      setForm({ ...data.profile, password: '' });
      setRole(data.role);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !form) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!form) return <div className="page">Loading...</div>;

  const isOwner = role === 'OWNER';

  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <h1>My Profile</h1>
      <p className="hint">Signed in as {isOwner ? 'account owner' : 'team member'} ({partner.username})</p>
      {error && <div className="error-box">{error}</div>}
      {saved && <div className="card" style={{ background: '#e1f5e5', color: '#1a7f3c' }}>Profile updated.</div>}

      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label>Name</label>
          <input value={form.name || ''} onChange={update('name')} required />
        </div>
        <div className="field">
          <label>Mobile</label>
          <input value={form.mobile || ''} onChange={update('mobile')} />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={form.email || ''} onChange={update('email')} />
        </div>

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
            Use my device's timezone ({detectBrowserTimezone()})
          </button>
        </div>

        <div className="field">
          <label>New Password (leave blank to keep unchanged)</label>
          <input type="password" value={form.password} onChange={update('password')} minLength={8} />
        </div>

        <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save Changes'}</button>
      </form>
    </div>
  );
}
