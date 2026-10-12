import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createBuilderUser, createProject, getBuilder, updateBuilder, updateBuilderUser, updateProject } from '../api/client';

// One builder: its status, its portal users and its projects (section 52).
export default function BuilderDetail() {
  const { builderId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [user, setUser] = useState({ name: '', email: '', password: '' });
  const [project, setProject] = useState({ projectId: '', name: '', city: '' });

  const load = () => getBuilder(builderId).then(({ data: d }) => setData(d)).catch((err) => setError(err.response?.data?.reason || err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [builderId]);

  const run = async (fn, done) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
      load();
      return true;
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
      return false;
    }
  };

  const resetPassword = (u) => {
    const password = window.prompt(`New password for ${u.name} (at least 8 characters). They will be signed out everywhere.`);
    if (password) run(() => updateBuilderUser(u.builderUserId, { password }), `Password reset for ${u.name}.`);
  };

  if (error && !data) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!data) return <div className="page">Loading...</div>;
  const { builder, users, projects } = data;
  const nextStatus = (s) => (s === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');

  return (
    <div className="page page-wide">
      <h1>{builder.name}</h1>
      {error && <div className="error-box">{error}</div>}
      {notice && <div className="info-box">{notice}</div>}
      <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span className={`badge ${builder.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{builder.status}</span>
        <span className="hint">Deactivating signs every user of this builder out immediately.</span>
        <button className="secondary" onClick={() => run(() => updateBuilder(builderId, { status: nextStatus(builder.status) }))}>
          {builder.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Portal users</h3>
        <table className="pro-table">
          <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.builderUserId}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td><span className={`badge ${u.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{u.status}</span></td>
                <td className="secondary-cell">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '-'}</td>
                <td>
                  <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => resetPassword(u)}>Reset password</button>
                  <button className="secondary" onClick={() => run(() => updateBuilderUser(u.builderUserId, { status: nextStatus(u.status) }))}>
                    {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={5} className="hint">No users yet.</td></tr>}
          </tbody>
        </table>
        <form
          onSubmit={(e) => { e.preventDefault(); run(() => createBuilderUser(builderId, user), `Added ${user.name}.`).then((ok) => ok && setUser({ name: '', email: '', password: '' })); }}
          style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', flexWrap: 'wrap' }}
        >
          <input placeholder="Name" value={user.name} onChange={(e) => setUser((u) => ({ ...u, name: e.target.value }))} required />
          <input type="email" placeholder="Email" value={user.email} onChange={(e) => setUser((u) => ({ ...u, email: e.target.value }))} required />
          <input type="password" placeholder="Initial password (8+)" autoComplete="new-password" value={user.password} onChange={(e) => setUser((u) => ({ ...u, password: e.target.value }))} required minLength={8} />
          <button className="primary" type="submit">Add User</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Projects</h3>
        <p className="hint">Partners pick from active projects when registering a lead; the referral goes to this builder.</p>
        <table className="pro-table">
          <thead><tr><th>Code</th><th>Name</th><th>City</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.projectId}>
                <td style={{ fontFamily: 'monospace' }}>{p.projectId}</td>
                <td>{p.name}</td>
                <td>{p.city || '-'}</td>
                <td><span className={`badge ${p.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{p.status}</span></td>
                <td>
                  <button className="secondary" onClick={() => run(() => updateProject(p.projectId, { status: nextStatus(p.status) }))}>
                    {p.status === 'ACTIVE' ? 'Close for referrals' : 'Reopen'}
                  </button>
                </td>
              </tr>
            ))}
            {projects.length === 0 && <tr><td colSpan={5} className="hint">No projects yet.</td></tr>}
          </tbody>
        </table>
        <form
          onSubmit={(e) => { e.preventDefault(); run(() => createProject({ ...project, builderId }), `Created ${project.name}.`).then((ok) => ok && setProject({ projectId: '', name: '', city: '' })); }}
          style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', flexWrap: 'wrap' }}
        >
          <input placeholder="Code, e.g. PROJECT-A" value={project.projectId} onChange={(e) => setProject((p) => ({ ...p, projectId: e.target.value }))} required />
          <input placeholder="Name" value={project.name} onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))} required />
          <input placeholder="City (optional)" value={project.city} onChange={(e) => setProject((p) => ({ ...p, city: e.target.value }))} />
          <button className="primary" type="submit">Add Project</button>
        </form>
      </div>
      <Link to="/builders"><button className="secondary">Back to Builders</button></Link>
    </div>
  );
}
