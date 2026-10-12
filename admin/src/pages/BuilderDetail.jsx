import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createBuilderUser, createProject, getBuilder, updateBuilder, updateBuilderUser, updateProject } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../utils/errors';
import { formatDateTime } from '../utils/timezone';
import { enumLabel } from '../i18n/enumLabels';

// One builder: its status, its portal users and its projects (section 52).
export default function BuilderDetail() {
  const { builderId } = useParams();
  const { timezone } = useAuth();
  const { t } = useTranslation(['builders', 'common', 'enums']);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [user, setUser] = useState({ name: '', email: '', password: '' });
  const [project, setProject] = useState({ projectId: '', name: '', city: '' });

  const load = () => getBuilder(builderId).then(({ data: d }) => setData(d)).catch((err) => setError(errorMessage(err)));
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
      setError(errorMessage(err));
      return false;
    }
  };

  const resetPassword = (u) => {
    const password = window.prompt(t('builders:detail.resetPrompt', { name: u.name }));
    if (password) run(() => updateBuilderUser(u.builderUserId, { password }), t('builders:detail.passwordReset', { name: u.name }));
  };

  if (error && !data) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!data) return <div className="page">{t('common:states.loading')}</div>;
  const { builder, users, projects } = data;
  const nextStatus = (s) => (s === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');

  return (
    <div className="page page-wide">
      <h1>{builder.name}</h1>
      {error && <div className="error-box">{error}</div>}
      {notice && <div className="info-box">{notice}</div>}
      <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span className={`badge ${builder.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{enumLabel('status', builder.status)}</span>
        <span className="hint">{t('builders:detail.deactivateHint')}</span>
        <button className="secondary" onClick={() => run(() => updateBuilder(builderId, { status: nextStatus(builder.status) }))}>
          {builder.status === 'ACTIVE' ? t('builders:detail.deactivate') : t('builders:detail.activate')}
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('builders:detail.usersTitle')}</h3>
        <table className="pro-table">
          <thead><tr>{['name', 'email', 'status', 'lastLogin', 'actions'].map((k) => <th key={k}>{t(`builders:detail.userColumns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.builderUserId}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td><span className={`badge ${u.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{enumLabel('status', u.status)}</span></td>
                <td className="secondary-cell">{u.lastLoginAt ? formatDateTime(u.lastLoginAt, timezone) : '-'}</td>
                <td>
                  <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => resetPassword(u)}>{t('builders:detail.resetPassword')}</button>
                  <button className="secondary" onClick={() => run(() => updateBuilderUser(u.builderUserId, { status: nextStatus(u.status) }))}>
                    {u.status === 'ACTIVE' ? t('builders:detail.deactivate') : t('builders:detail.activate')}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={5} className="hint">{t('builders:detail.noUsers')}</td></tr>}
          </tbody>
        </table>
        <form
          onSubmit={(e) => { e.preventDefault(); run(() => createBuilderUser(builderId, user), t('builders:detail.userForm.added', { name: user.name })).then((ok) => ok && setUser({ name: '', email: '', password: '' })); }}
          style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', flexWrap: 'wrap' }}
        >
          <input placeholder={t('builders:detail.userForm.name')} aria-label={t('builders:detail.userForm.name')} value={user.name} onChange={(e) => setUser((u) => ({ ...u, name: e.target.value }))} required />
          <input type="email" placeholder={t('builders:detail.userForm.email')} aria-label={t('builders:detail.userForm.email')} value={user.email} onChange={(e) => setUser((u) => ({ ...u, email: e.target.value }))} required />
          <input type="password" placeholder={t('builders:detail.userForm.initialPassword')} aria-label={t('builders:detail.userForm.initialPassword')} autoComplete="new-password" value={user.password} onChange={(e) => setUser((u) => ({ ...u, password: e.target.value }))} required minLength={8} />
          <button className="primary" type="submit">{t('builders:detail.userForm.add')}</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('builders:detail.projectsTitle')}</h3>
        <p className="hint">{t('builders:detail.projectsHint')}</p>
        <table className="pro-table">
          <thead><tr>{['code', 'name', 'city', 'status', 'actions'].map((k) => <th key={k}>{t(`builders:detail.projectColumns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.projectId}>
                <td style={{ fontFamily: 'monospace' }}>{p.projectId}</td>
                <td>{p.name}</td>
                <td>{p.city || '-'}</td>
                <td><span className={`badge ${p.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{enumLabel('status', p.status)}</span></td>
                <td>
                  <button className="secondary" onClick={() => run(() => updateProject(p.projectId, { status: nextStatus(p.status) }))}>
                    {p.status === 'ACTIVE' ? t('builders:detail.closeReferrals') : t('builders:detail.reopen')}
                  </button>
                </td>
              </tr>
            ))}
            {projects.length === 0 && <tr><td colSpan={5} className="hint">{t('builders:detail.noProjects')}</td></tr>}
          </tbody>
        </table>
        <form
          onSubmit={(e) => { e.preventDefault(); run(() => createProject({ ...project, builderId }), t('builders:detail.projectForm.created', { name: project.name })).then((ok) => ok && setProject({ projectId: '', name: '', city: '' })); }}
          style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', flexWrap: 'wrap' }}
        >
          <input placeholder={t('builders:detail.projectForm.code')} aria-label={t('builders:detail.projectForm.code')} value={project.projectId} onChange={(e) => setProject((p) => ({ ...p, projectId: e.target.value }))} required />
          <input placeholder={t('builders:detail.projectForm.name')} aria-label={t('builders:detail.projectForm.name')} value={project.name} onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))} required />
          <input placeholder={t('builders:detail.projectForm.city')} aria-label={t('builders:detail.projectForm.city')} value={project.city} onChange={(e) => setProject((p) => ({ ...p, city: e.target.value }))} />
          <button className="primary" type="submit">{t('builders:detail.projectForm.add')}</button>
        </form>
      </div>
      <Link to="/builders"><button className="secondary">{t('builders:detail.back')}</button></Link>
    </div>
  );
}
