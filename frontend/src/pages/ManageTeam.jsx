import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTeamMember, deleteTeamMember, getMyProfile, listRoles, listTeam, listUserFields, updateTeamMember } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';
import TeamTabs from '../components/TeamTabs';
import DynamicFieldInput from '../components/DynamicFieldInput';
import { PERMISSIONS, PERMISSION_LABELS } from '../utils/permissions';
import { findFieldErrors, focusField } from '../utils/formValidation';
import { csvCell } from '../utils/csv';

const GROUP_ORDER = ['Basic Information', 'Preferences'];
const initialFilters = { search: '', status: '', timezone: '' };

function sortGroups(groups) {
  return [...groups].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a);
    const bi = GROUP_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ManageTeam() {
  const { partner } = useAuth();
  const navigate = useNavigate();
  // Sourced fresh from the server rather than the cached session, so a
  // stale/older login (from before permissions existed) can't hide controls
  // this session is actually entitled to (section 34).
  const [permissions, setPermissions] = useState(partner.permissions || []);
  const [members, setMembers] = useState(null);
  const [roles, setRoles] = useState([]);
  const [fieldDefs, setFieldDefs] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [values, setValues] = useState({});
  const [roleId, setRoleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState(new Map());
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = () => {
    Promise.all([listTeam(), getMyProfile(), listRoles(), listUserFields()])
      .then(([{ data }, { data: me }, { data: roleData }, { data: fieldData }]) => {
        setMembers(data.members);
        setPermissions(me.permissions || []);
        setRoles(roleData.roles);
        setFieldDefs(fieldData.definitions.filter((d) => d.isEnabled));
        setRoleId((r) => (r ? r : roleData.roles.find((r2) => r2.name === 'Manager')?.roleId || ''));
        setValues((v) => (v.timezone ? v : { ...v, timezone: 'UTC' }));
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  useEffect(load, []);

  const canManageTeam = permissions.includes(PERMISSIONS.MANAGE_TEAM);

  const activeCount = (members || []).filter((m) => m.status === 'ACTIVE').length;
  const inactiveCount = (members || []).filter((m) => m.status === 'INACTIVE').length;
  const availableTimezones = members ? [...new Set(members.map((m) => m.timezone))].sort() : [];

  const filteredMembers = (members || []).filter((m) => {
    const search = filters.search.trim().toLowerCase();
    if (search && !m.name.toLowerCase().includes(search) && !m.username.toLowerCase().includes(search)) return false;
    if (filters.status && m.status !== filters.status) return false;
    if (filters.timezone && m.timezone !== filters.timezone) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedMembers = filteredMembers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const setStatusTab = (status) => {
    setFilters((f) => ({ ...f, status }));
    setPage(1);
  };

  const setValue = (fieldKey, val) => {
    setValues((v) => ({ ...v, [fieldKey]: val }));
    setFieldErrors((m) => {
      if (!m.has(fieldKey)) return m;
      const next = new Map(m);
      next.delete(fieldKey);
      return next;
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);

    const errs = findFieldErrors(fieldDefs, values);
    if (errs.length > 0) {
      setFieldErrors(new Map(errs.map((er) => [er.fieldKey, er.message])));
      setError(`${errs.length === 1 ? 'A field needs' : `${errs.length} fields need`} your attention - see below.`);
      focusField(errs[0].fieldKey);
      return;
    }

    setBusy(true);
    try {
      const payload = { roleId };
      for (const def of fieldDefs) {
        const val = values[def.fieldKey];
        if (val === undefined || val === '') continue;
        payload[def.fieldKey] = def.dataType === 'NUMBER' ? Number(val) : val;
      }
      await createTeamMember(payload);
      setValues({ timezone: 'UTC' });
      setFieldErrors(new Map());
      setShowForm(false);
      load();
    } catch (err) {
      const data = err.response?.data;
      if (data?.fieldKey) {
        setFieldErrors(new Map([[data.fieldKey, data.reason]]));
        setError(data.reason);
        focusField(data.fieldKey);
      } else {
        setError(data?.reason || err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (member) => {
    try {
      await updateTeamMember(member.memberId, { status: member.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const remove = async (member) => {
    try {
      await deleteTeamMember(member.memberId);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const exportCsv = () => {
    const header = ['Name', 'Username', 'Mobile', 'Email', 'Role', 'Timezone', 'Status', 'Added'];
    const rows = filteredMembers.map((m) => [
      m.name, m.username, m.mobile || '', m.email || '', m.roleName || '', m.timezone, m.status, formatDateTime(m.createdAt, partner.timezone)
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'team-members.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page page-wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>Manage Team</h1>
          <p className="hint" style={{ margin: 0 }}>
            {canManageTeam
              ? 'Add, edit, deactivate, or remove people on your team - they share access to the same leads.'
              : "You don't have permission to add, edit, or remove team members."}
          </p>
        </div>
        {canManageTeam && (
          <button className="pill-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ Add New User'}
          </button>
        )}
      </div>

      <TeamTabs />

      {error && <div className="error-box">{error}</div>}

      {showForm && canManageTeam && fieldDefs && (
        <form className="card" onSubmit={handleCreate} noValidate>
          <div className="edit-form-sections">
            {sortGroups([...new Set(fieldDefs.map((d) => d.group))]).map((group) => (
              <div key={group}>
                <h3 className="form-section-title"><span>{group}</span></h3>
                {fieldDefs.filter((d) => d.group === group).map((def) => (
                  <div className={`field ${fieldErrors.has(def.fieldKey) ? 'invalid' : ''}`} key={def.fieldKey} id={`field-${def.fieldKey}`}>
                    <label>
                      {def.label}{def.isRequired ? ' *' : ''}{def.fieldKey === 'password' ? ' (min 8 characters)' : ''}
                    </label>
                    <DynamicFieldInput def={def} value={values[def.fieldKey]} onChange={(val) => setValue(def.fieldKey, val)} />
                    {fieldErrors.has(def.fieldKey) && <span className="field-error">{fieldErrors.get(def.fieldKey)}</span>}
                  </div>
                ))}
              </div>
            ))}

            <div>
              <h3 className="form-section-title"><span>Role &amp; Permissions</span></h3>
              <div className="role-picker">
                {roles.map((r) => (
                  <div
                    key={r.roleId}
                    className={`role-picker-item ${roleId === r.roleId ? 'selected' : ''}`}
                    onClick={() => setRoleId(r.roleId)}
                  >
                    <div className="role-name">
                      <input type="radio" checked={roleId === r.roleId} onChange={() => setRoleId(r.roleId)} />
                      {r.name}
                    </div>
                    <div className="role-perms">
                      {r.permissions.length ? r.permissions.map((p) => PERMISSION_LABELS[p]).join(' · ') : 'No permissions'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="edit-form-footer">
            <div className="meta" />
            <div className="actions">
              <button className="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="primary" type="submit" disabled={busy}>{busy ? 'Adding...' : 'Add Team Member'}</button>
            </div>
          </div>
        </form>
      )}

      {members && (
        <div className="status-tabs">
          <button className={filters.status === '' ? 'active' : ''} onClick={() => setStatusTab('')}>
            <span className="dot all" />All ({members.length})
          </button>
          <button className={filters.status === 'ACTIVE' ? 'active' : ''} onClick={() => setStatusTab('ACTIVE')}>
            <span className="dot active-dot" />Active ({activeCount})
          </button>
          <button className={filters.status === 'INACTIVE' ? 'active' : ''} onClick={() => setStatusTab('INACTIVE')}>
            <span className="dot inactive-dot" />Inactive ({inactiveCount})
          </button>
        </div>
      )}

      {members && members.length > 0 && (
        <div className="toolbar">
          <div className="toolbar-left">
            <input
              type="text"
              placeholder="Search name or username..."
              value={filters.search}
              onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPage(1); }}
            />
          </div>
          <div className="toolbar-right">
            <select value={filters.timezone} onChange={(e) => { setFilters((f) => ({ ...f, timezone: e.target.value })); setPage(1); }}>
              <option value="">All timezones</option>
              {availableTimezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
            <button className="pill-export" onClick={exportCsv}>Export</button>
            <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Show
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              entries
            </label>
          </div>
        </div>
      )}

      <div className="card">
        <table className="pro-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Role</th>
              <th>Timezone</th>
              <th>Status</th>
              <th>Added</th>
              {canManageTeam && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {pagedMembers.map((m) => (
              <tr key={m.memberId}>
                <td>
                  <div className="primary-cell">{m.name}</div>
                  <div className="secondary-cell">{m.username}</div>
                </td>
                <td>{m.mobile || m.email || '-'}</td>
                <td>{m.roleName || '-'}</td>
                <td>{m.timezone}</td>
                <td>
                  <label className="toggle-switch" title={m.status === 'ACTIVE' ? 'Active - click to deactivate' : 'Inactive - click to activate'}>
                    <input type="checkbox" checked={m.status === 'ACTIVE'} disabled={!canManageTeam} onChange={() => canManageTeam && toggleStatus(m)} />
                    <span className="slider" />
                  </label>
                </td>
                <td className="secondary-cell">{formatDateTime(m.createdAt, partner.timezone)}</td>
                {canManageTeam && (
                  <td>
                    <button className="icon-btn edit" title="Edit" onClick={() => navigate(`/team/${m.memberId}/edit`)}><EditIcon /></button>
                    <button className="icon-btn remove" title="Remove" onClick={() => remove(m)}><TrashIcon /></button>
                  </td>
                )}
              </tr>
            ))}
            {members && members.length === 0 && (
              <tr><td colSpan={canManageTeam ? 7 : 6} className="hint">No team members yet.</td></tr>
            )}
            {members && members.length > 0 && filteredMembers.length === 0 && (
              <tr><td colSpan={canManageTeam ? 7 : 6} className="hint">No team members match these filters.</td></tr>
            )}
          </tbody>
        </table>
        {!members && !error && <p className="hint">Loading...</p>}

        {filteredMembers.length > 0 && (
          <div className="pagination-bar">
            <span className="hint">
              Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredMembers.length)} of {filteredMembers.length} entries
            </span>
            <div className="pagination-buttons">
              <button className="page-btn" disabled={currentPage <= 1} onClick={() => setPage(1)}>&laquo;</button>
              <button className="page-btn" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>&lsaquo;</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button key={p} className={`page-btn ${p === currentPage ? 'current' : ''}`} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>&rsaquo;</button>
              <button className="page-btn" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>&raquo;</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
