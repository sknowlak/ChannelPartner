import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listRegistrations } from '../api/client';
import { csvCell } from '../utils/csv';

const initialFilters = { partnerId: '', projectId: '', status: '', isBooked: '' };

export default function Registrations() {
  const [registrations, setRegistrations] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const navigate = useNavigate();

  const load = (overrides = {}) => {
    const effective = { ...filters, ...overrides };
    const params = Object.fromEntries(Object.entries(effective).filter(([, v]) => v));
    listRegistrations(params)
      .then(({ data }) => { setRegistrations(data.registrations); setPage(1); })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  useEffect(load, []);

  const setBookedTab = (isBooked) => {
    setFilters((f) => ({ ...f, isBooked }));
    load({ isBooked });
  };

  const exportCsv = () => {
    const header = ['Registration ID', 'Partner', 'Project', 'Status', 'Stage', 'Booked'];
    const rows = registrations.map((r) => [r.registrationId, r.partnerId, r.projectId, r.status, r.currentStage, r.isBooked ? 'Yes' : 'No']);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'registrations.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const bookedCount = registrations.filter((r) => r.isBooked).length;
  const pendingCount = registrations.filter((r) => !r.isBooked).length;

  const totalPages = Math.max(1, Math.ceil(registrations.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRegistrations = registrations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="page page-wide">
      <h1>Registrations</h1>
      {error && <div className="error-box">{error}</div>}

      <div className="status-tabs">
        <button className={filters.isBooked === '' ? 'active' : ''} onClick={() => setBookedTab('')}>
          <span className="dot all" />All ({registrations.length})
        </button>
        <button className={filters.isBooked === 'false' ? 'active' : ''} onClick={() => setBookedTab('false')}>
          <span className="dot active-dot" />Pending ({pendingCount})
        </button>
        <button className={filters.isBooked === 'true' ? 'active' : ''} onClick={() => setBookedTab('true')}>
          <span className="dot inactive-dot" />Booked ({bookedCount})
        </button>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <input
            type="text"
            placeholder="Search by Partner ID..."
            value={filters.partnerId}
            onChange={(e) => setFilters((f) => ({ ...f, partnerId: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
        </div>
        <div className="toolbar-right">
          <input placeholder="Project ID" value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))} style={{ padding: '0.5rem 0.7rem', border: '1px solid #d8dce3', borderRadius: 8 }} />
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">Any status</option>
            <option value="ACCEPTED">ACCEPTED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
          <button className="secondary" onClick={() => load()}>Apply</button>
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

      <div className="card">
        <table className="pro-table">
          <thead>
            <tr><th>Registration</th><th>Partner</th><th>Project</th><th>Status</th><th>Stage</th><th>Booked</th></tr>
          </thead>
          <tbody>
            {pagedRegistrations.map((r) => (
              <tr key={r.registrationId} className="clickable" onClick={() => navigate(`/registrations/${r.registrationId}`)}>
                <td className="primary-cell">{r.registrationId}</td>
                <td>{r.partnerId}</td>
                <td>{r.projectId || '-'}</td>
                <td><span className={`badge ${r.status.toLowerCase()}`}>{r.status}</span></td>
                <td>{r.currentStage}</td>
                <td><span className={`badge ${r.isBooked ? 'accepted' : 'pending'}`}>{r.isBooked ? 'Booked' : 'Pending'}</span></td>
              </tr>
            ))}
            {registrations.length === 0 && <tr><td colSpan={6} className="hint">No registrations match these filters.</td></tr>}
          </tbody>
        </table>

        {registrations.length > 0 && (
          <div className="pagination-bar">
            <span className="hint">
              Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, registrations.length)} of {registrations.length} entries
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
