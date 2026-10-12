import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createBuilder, listBuilders } from '../api/client';

// Builder organizations (section 52). Each builder gets portal users and the
// projects partners can refer leads to - managed on the detail page.
export default function Builders() {
  const [builders, setBuilders] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => listBuilders().then(({ data }) => setBuilders(data.builders)).catch((err) => setError(err.response?.data?.reason || err.message));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createBuilder({ name });
      setName('');
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-wide">
      <h1>Builders &amp; Projects</h1>
      <p className="hint">Builders log in to the builder portal to accept referrals for their projects and confirm bookings.</p>
      {error && <div className="error-box">{error}</div>}
      <form className="card" onSubmit={create} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>New builder organization</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Prestige Group" required />
        </div>
        <button className="primary" type="submit" disabled={busy}>Add Builder</button>
      </form>
      <div className="card">
        <table className="pro-table">
          <thead><tr><th>Builder</th><th>Status</th><th>Users</th><th>Projects</th></tr></thead>
          <tbody>
            {(builders || []).map((b) => (
              <tr key={b.builderId}>
                <td><Link to={`/builders/${b.builderId}`}>{b.name}</Link></td>
                <td><span className={`badge ${b.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{b.status}</span></td>
                <td>{b.userCount}</td>
                <td>{b.projectCount}</td>
              </tr>
            ))}
            {builders && builders.length === 0 && <tr><td colSpan={4} className="hint">No builders yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
