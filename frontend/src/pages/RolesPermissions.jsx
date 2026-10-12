import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createRole, deleteRole, getMyProfile, listRoles, updateRole } from '../api/client';
import TeamTabs from '../components/TeamTabs';
import { PERMISSIONS, permissionLabel } from '../utils/permissions';
import { roleLabel } from '../i18n/dataLabels';

const ALL_PERMISSIONS = Object.values(PERMISSIONS);
const initialForm = { name: '', permissions: [] };

export default function RolesPermissions() {
  const { t } = useTranslation(['team', 'common', 'data']);
  const [roles, setRoles] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    Promise.all([listRoles(), getMyProfile()])
      .then(([{ data }, { data: me }]) => {
        setRoles(data.roles);
        setPermissions(me.permissions || []);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  useEffect(load, []);

  const canManageRoles = permissions.includes(PERMISSIONS.MANAGE_ROLES);

  const togglePermission = (perm, target, setTarget) => {
    setTarget((f) => ({
      ...f,
      permissions: f.permissions.includes(perm) ? f.permissions.filter((p) => p !== perm) : [...f.permissions, perm]
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createRole(form);
      setForm(initialForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (role) => {
    setEditingId(role.roleId);
    setEditForm({ name: role.name, permissions: [...role.permissions] });
  };

  const saveEdit = async (roleId) => {
    setBusy(true);
    setError(null);
    try {
      await updateRole(roleId, editForm);
      setEditingId(null);
      setEditForm(null);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (role) => {
    setError(null);
    try {
      await deleteRole(role.roleId);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  return (
    <div className="page page-wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>{t('team:title')}</h1>
          <p className="hint" style={{ margin: 0 }}>
            {canManageRoles
              ? t('team:rolesPage.intro')
              : t('team:rolesPage.noPermission')}
          </p>
        </div>
        {canManageRoles && (
          <button className="pill-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? t('common:actions.cancel') : t('team:rolesPage.createCustom')}
          </button>
        )}
      </div>

      <TeamTabs />

      {error && <div className="error-box">{error}</div>}

      {showForm && canManageRoles && (
        <form className="card" onSubmit={handleCreate}>
          <div className="field">
            <label>{t('team:rolesPage.roleName')}</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#444' }}>{t('team:rolesPage.permissions')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '0.5rem 0 1rem' }}>
            {ALL_PERMISSIONS.map((perm) => (
              <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={form.permissions.includes(perm)}
                  onChange={() => togglePermission(perm, form, setForm)}
                />
                {permissionLabel(perm)}
              </label>
            ))}
          </div>
          <button className="primary" type="submit" disabled={busy}>{busy ? t('team:rolesPage.creating') : t('team:rolesPage.createRole')}</button>
        </form>
      )}

      <div className="card">
        <table className="pro-table">
          <thead>
            <tr>
              <th>{t('common:fields.role')}</th>
              <th>{t('team:rolesPage.permissions')}</th>
              <th>{t('team:rolesPage.members')}</th>
              {canManageRoles && <th>{t('common:fields.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {roles && roles.map((r) => (
              editingId === r.roleId ? (
                <tr key={r.roleId}>
                  <td><input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} /></td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {ALL_PERMISSIONS.map((perm) => (
                        <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 400 }}>
                          <input
                            type="checkbox"
                            checked={editForm.permissions.includes(perm)}
                            onChange={() => togglePermission(perm, editForm, setEditForm)}
                          />
                          {permissionLabel(perm)}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>{r.memberCount}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="primary" disabled={busy} onClick={() => saveEdit(r.roleId)}>{t('common:actions.save')}</button>
                      <button className="secondary" disabled={busy} onClick={() => { setEditingId(null); setEditForm(null); }}>{t('common:actions.cancel')}</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.roleId}>
                  <td>
                    <div className="primary-cell">{roleLabel(r.name)}</div>
                    {r.isSystem && <div className="secondary-cell">{t('team:rolesPage.systemRole')}</div>}
                  </td>
                  <td className="secondary-cell">{r.permissions.length ? r.permissions.map((p) => permissionLabel(p)).join(', ') : t('team:permissions.none')}</td>
                  <td>{r.memberCount}</td>
                  {canManageRoles && (
                    <td>
                      {!r.isSystem && (
                        <>
                          <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => startEdit(r)}>{t('common:actions.edit')}</button>
                          <button className="danger" onClick={() => remove(r)}>{t('common:actions.delete')}</button>
                        </>
                      )}
                      {r.isSystem && <span className="hint">{t('team:rolesPage.builtIn')}</span>}
                    </td>
                  )}
                </tr>
              )
            ))}
            {roles && roles.length === 0 && <tr><td colSpan={canManageRoles ? 4 : 3} className="hint">{t('team:rolesPage.empty')}</td></tr>}
          </tbody>
        </table>
        {!roles && !error && <p className="hint">{t('common:states.loading')}</p>}
      </div>
    </div>
  );
}
