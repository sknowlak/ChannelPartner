import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getMyProfile, getTeamMember, updateTeamMember } from '../api/client';
import { COMMON_TIMEZONES } from '../utils/timezone';

export default function EditTeamMember() {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const [role, setRole] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([getTeamMember(memberId), getMyProfile()])
      .then(([{ data: member }, { data: me }]) => {
        setForm({ name: member.name, mobile: member.mobile || '', email: member.email || '', timezone: member.timezone, status: member.status, password: '' });
        setRole(me.role);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, [memberId]);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      await updateTeamMember(memberId, payload);
      navigate('/team');
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !form) return <div className="page page-wide"><div className="error-box">{error}</div></div>;
  if (!form) return <div className="page page-wide">Loading...</div>;

  if (role !== 'OWNER') {
    return (
      <div className="page page-wide">
        <div className="error-box">Only the account owner can edit team members.</div>
        <Link to="/team"><button className="secondary">Back to Manage Team</button></Link>
      </div>
    );
  }

  return (
    <div className="page page-wide">
      <h1>Edit Team Member</h1>
      {error && <div className="error-box">{error}</div>}

      <form className="card" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={update('name')} required />
          </div>
          <div className="field">
            <label>Mobile</label>
            <input value={form.mobile} onChange={update('mobile')} />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={form.email} onChange={update('email')} />
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
            <label>Status</label>
            <select value={form.status} onChange={update('status')}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </div>
          <div className="field">
            <label>New Password (leave blank to keep unchanged)</label>
            <input type="password" value={form.password} onChange={update('password')} minLength={8} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save Changes'}</button>
          <button className="secondary" type="button" onClick={() => navigate('/team')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
