import { useEffect, useState } from 'react';
import { createRole, deleteRole, getMyProfile, listRoles, updateRole } from '../api/client';
import TeamTabs from '../components/TeamTabs';
import { PERMISSIONS, PERMISSION_LABELS } from '../utils/permissions';

const ALL_PERMISSIONS = Object.values(PERMISSIONS);
const initialForm = { name: '', permissions: [] };

export default function RolesPermissions() {
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
          <h1 style={{ marginBottom: '0.2rem' }}>Manage Team</h1>
          <p className="hint" style={{ margin: 0 }}>
            {canManageRoles
              ? 'Super Admin, Admin, and Manager are built-in and cannot be changed - create a custom role for anything else.'
              : "You don't have permission to manage roles."}
          </p>
        </div>
        {canManageRoles && (
          <button className="pill-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ Create Custom Role'}
          </button>
        )}
      </div>

      <TeamTabs />

      {error && <div className="error-box">{error}</div>}

      {showForm && canManageRoles && (
        <form className="card" onSubmit={handleCreate}>
          <div className="field">
            <label>Role Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#444' }}>Permissions</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '0.5rem 0 1rem' }}>
            {ALL_PERMISSIONS.map((perm) => (
              <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={form.permissions.includes(perm)}
                  onChange={() => togglePermission(perm, form, setForm)}
                />
                {PERMISSION_LABELS[perm]}
              </label>
            ))}
          </div>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create Role'}</button>
        </form>
      )}

      <div className="card">
        <table className="pro-table">
          <thead>
            <tr><th>Role</th><th>Permissions</th><th>Members</th>{canManageRoles && <th>Actions</th>}</tr>
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
                          {PERMISSION_LABELS[perm]}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>{r.memberCount}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="primary" disabled={busy} onClick={() => saveEdit(r.roleId)}>Save</button>
                      <button className="secondary" disabled={busy} onClick={() => { setEditingId(null); setEditForm(null); }}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.roleId}>
                  <td>
                    <div className="primary-cell">{r.name}</div>
                    {r.isSystem && <div className="secondary-cell">System role</div>}
                  </td>
                  <td className="secondary-cell">{r.permissions.length ? r.permissions.map((p) => PERMISSION_LABELS[p]).join(', ') : 'No permissions'}</td>
                  <td>{r.memberCount}</td>
                  {canManageRoles && (
                    <td>
                      {!r.isSystem && (
                        <>
                          <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => startEdit(r)}>Edit</button>
                          <button className="danger" onClick={() => remove(r)}>Delete</button>
                        </>
                      )}
                      {r.isSystem && <span className="hint">Built-in</span>}
                    </td>
                  )}
                </tr>
              )
            ))}
            {roles && roles.length === 0 && <tr><td colSpan={canManageRoles ? 4 : 3} className="hint">No roles yet.</td></tr>}
          </tbody>
        </table>
        {!roles && !error && <p className="hint">Loading...</p>}
      </div>
    </div>
  );
}
