import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listMyRegistrations } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/timezone';

const initialFilters = { search: '', status: '', projectId: '' };

function ViewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function requirementSummary(r) {
  const parts = [r.bhk, r.propertyType, r.requirementType].filter(Boolean);
  const budget = r.budgetMin || r.budgetMax
    ? `₹${(r.budgetMin || 0).toLocaleString()}${r.budgetMax ? ' - ₹' + r.budgetMax.toLocaleString() : '+'}`
    : '';
  return [parts.join(' · '), budget].filter(Boolean).join(' | ') || '-';
}

export default function MyLeads() {
  const [registrations, setRegistrations] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { partner } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    listMyRegistrations()
      .then(({ data }) => setRegistrations(data.registrations))
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, []);

  const bookedCount = (registrations || []).filter((r) => r.isBooked).length;
  const pendingCount = (registrations || []).filter((r) => !r.isBooked).length;
  const availableProjects = registrations ? [...new Set(registrations.map((r) => r.projectId).filter(Boolean))].sort() : [];

  const filteredRegistrations = (registrations || []).filter((r) => {
    const search = filters.search.trim().toLowerCase();
    if (search && !r.customerName.toLowerCase().includes(search) && !r.customerMobile.includes(search) && !r.registrationId.toLowerCase().includes(search)) return false;
    if (filters.status === 'BOOKED' && !r.isBooked) return false;
    if (filters.status === 'PENDING' && r.isBooked) return false;
    if (filters.projectId && r.projectId !== filters.projectId) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredRegistrations.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRegistrations = filteredRegistrations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const setStatusTab = (status) => {
    setFilters((f) => ({ ...f, status }));
    setPage(1);
  };

  const exportCsv = () => {
    const header = ['Registration ID', 'Lead Name', 'Mobile', 'Project', 'Requirement', 'Stage', 'Booked', 'Protection Until'];
    const rows = filteredRegistrations.map((r) => [
      r.registrationId, r.customerName, r.customerMobile, r.projectId, requirementSummary(r), r.currentStage,
      r.isBooked ? 'Yes' : 'No', formatDate(r.protectionExpiry, partner.timezone)
    ]);
    const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page page-wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>My Leads</h1>
          <p className="hint" style={{ margin: 0 }}>Signed in as {partner.name} ({partner.partnerId}) · times shown in {partner.timezone}</p>
        </div>
        <button className="pill-primary" onClick={() => navigate('/register-lead')}>+ Add Lead</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {registrations && (
        <div className="status-tabs">
          <button className={!filters.status ? 'active' : ''} onClick={() => setStatusTab('')}>
            <span className="dot all" />All ({registrations.length})
          </button>
          <button className={filters.status === 'PENDING' ? 'active' : ''} onClick={() => setStatusTab('PENDING')}>
            <span className="dot active-dot" />Pending ({pendingCount})
          </button>
          <button className={filters.status === 'BOOKED' ? 'active' : ''} onClick={() => setStatusTab('BOOKED')}>
            <span className="dot inactive-dot" />Booked ({bookedCount})
          </button>
        </div>
      )}

      {registrations && registrations.length > 0 && (
        <div className="toolbar">
          <div className="toolbar-left">
            <input
              type="text"
              placeholder="Search by name, mobile, or registration ID..."
              value={filters.search}
              onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPage(1); }}
            />
          </div>
          <div className="toolbar-right">
            <select value={filters.projectId} onChange={(e) => { setFilters((f) => ({ ...f, projectId: e.target.value })); setPage(1); }}>
              <option value="">All projects</option>
              {availableProjects.map((p) => <option key={p} value={p}>{p}</option>)}
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
              <th>Lead</th>
              <th>Project</th>
              <th>Requirement</th>
              <th>Stage</th>
              <th>Booked</th>
              <th>Protection Until</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedRegistrations.map((r) => (
              <tr key={r.registrationId}>
                <td>
                  <div className="primary-cell">{r.customerName || '-'}</div>
                  <div className="secondary-cell">{r.customerMobile} · {r.registrationId}</div>
                </td>
                <td>{r.projectId || '-'}</td>
                <td className="secondary-cell">{requirementSummary(r)}</td>
                <td>{r.currentStage}</td>
                <td><span className={`badge ${r.isBooked ? 'accepted' : 'pending'}`}>{r.isBooked ? 'Booked' : 'Pending'}</span></td>
                <td className="secondary-cell">{formatDate(r.protectionExpiry, partner.timezone)}</td>
                <td>
                  <button className="icon-btn edit" title="View" onClick={() => navigate(`/registrations/${r.registrationId}`)}><ViewIcon /></button>
                </td>
              </tr>
            ))}
            {registrations && registrations.length === 0 && (
              <tr><td colSpan={7} className="hint">No leads yet - register your first one.</td></tr>
            )}
            {registrations && registrations.length > 0 && filteredRegistrations.length === 0 && (
              <tr><td colSpan={7} className="hint">No leads match these filters.</td></tr>
            )}
          </tbody>
        </table>
        {!registrations && !error && <p className="hint">Loading...</p>}

        {filteredRegistrations.length > 0 && (
          <div className="pagination-bar">
            <span className="hint">
              Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredRegistrations.length)} of {filteredRegistrations.length} entries
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
