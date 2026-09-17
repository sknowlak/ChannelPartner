import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTeamMember, deleteTeamMember, getMyProfile, listTeam, updateTeamMember } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COMMON_TIMEZONES, formatDateTime } from '../utils/timezone';

const initialForm = { name: '', mobile: '', email: '', username: '', password: '', timezone: 'UTC' };
const initialFilters = { search: '', status: '', timezone: '' };

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
  // stale/older login (from before role tracking existed) can't hide the
  // owner-only controls it's actually entitled to.
  const [role, setRole] = useState(partner.role || null);
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = () => {
    Promise.all([listTeam(), getMyProfile()])
      .then(([{ data }, { data: me }]) => {
        setMembers(data.members);
        setRole(me.role);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  useEffect(load, []);

  const isOwner = role === 'OWNER';

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

  const handleCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createTeamMember(form);
      setForm(initialForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
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
    const header = ['Name', 'Username', 'Mobile', 'Email', 'Timezone', 'Status', 'Added'];
    const rows = filteredMembers.map((m) => [
      m.name, m.username, m.mobile || '', m.email || '', m.timezone, m.status, formatDateTime(m.createdAt, partner.timezone)
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
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
            {isOwner
              ? 'Add, edit, deactivate, or remove people on your team - they share access to the same leads.'
              : 'Only the account owner can add, edit, or remove team members.'}
          </p>
        </div>
        {isOwner && (
          <button className="pill-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ Add New User'}
          </button>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}

      {showForm && isOwner && (
        <form className="card" onSubmit={handleCreate}>
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Mobile</label>
            <input value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="field">
            <label>Username</label>
            <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Password (min 8 characters)</label>
            <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} />
          </div>
          <div className="field">
            <label>Timezone</label>
            <select value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}>
              {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Adding...' : 'Add Team Member'}</button>
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
              <th>Timezone</th>
              <th>Status</th>
              <th>Added</th>
              {isOwner && <th>Actions</th>}
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
                <td>{m.timezone}</td>
                <td>
                  <label className="toggle-switch" title={m.status === 'ACTIVE' ? 'Active - click to deactivate' : 'Inactive - click to activate'}>
                    <input type="checkbox" checked={m.status === 'ACTIVE'} disabled={!isOwner} onChange={() => isOwner && toggleStatus(m)} />
                    <span className="slider" />
                  </label>
                </td>
                <td className="secondary-cell">{formatDateTime(m.createdAt, partner.timezone)}</td>
                {isOwner && (
                  <td>
                    <button className="icon-btn edit" title="Edit" onClick={() => navigate(`/team/${m.memberId}/edit`)}><EditIcon /></button>
                    <button className="icon-btn remove" title="Remove" onClick={() => remove(m)}><TrashIcon /></button>
                  </td>
                )}
              </tr>
            ))}
            {members && members.length === 0 && (
              <tr><td colSpan={isOwner ? 6 : 5} className="hint">No team members yet.</td></tr>
            )}
            {members && members.length > 0 && filteredMembers.length === 0 && (
              <tr><td colSpan={isOwner ? 6 : 5} className="hint">No team members match these filters.</td></tr>
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
