import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPartner, listFieldDefinitions, listPartners } from '../api/client';
import PartnerForm from '../components/PartnerForm';

const EMPTY_FORM = { customFields: {} };
const initialFilters = { name: '', city: '', status: '', kycStatus: '', createdFrom: '', createdTo: '' };

export default function Partners() {
  const [partners, setPartners] = useState([]);
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const navigate = useNavigate();

  useEffect(() => {
    listFieldDefinitions().then(({ data }) => setFieldDefinitions(data.definitions)).catch(() => {});
  }, []);

  const load = (overrides = {}) => {
    const effective = { ...filters, ...overrides };
    const params = Object.fromEntries(Object.entries(effective).filter(([, v]) => v));
    listPartners(params)
      .then(({ data }) => { setPartners(data.partners); setPage(1); })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  useEffect(load, []);

  const setStatusTab = (status) => {
    setFilters((f) => ({ ...f, status }));
    load({ status });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createPartner(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const header = ['Partner ID', 'Name', 'Status', 'KYC', 'City', 'Email'];
    const rows = partners.map((p) => [p.partnerId, p.name, p.status, p.kycStatus, p.city || '', p.email]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'channel-partners.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeCount = partners.filter((p) => p.status === 'ACTIVE').length;
  const inactiveCount = partners.filter((p) => p.status === 'INACTIVE').length;

  const totalPages = Math.max(1, Math.ceil(partners.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedPartners = partners.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="page page-wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Channel Partners</h1>
        <button className="pill-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ New Partner'}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <PartnerForm fieldDefinitions={fieldDefinitions} values={form} onChange={setForm} mode="create" />
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create Partner'}</button>
        </form>
      )}

      <div className="status-tabs">
        <button className={!filters.status ? 'active' : ''} onClick={() => setStatusTab('')}>
          <span className="dot all" />All ({partners.length})
        </button>
        <button className={filters.status === 'ACTIVE' ? 'active' : ''} onClick={() => setStatusTab('ACTIVE')}>
          <span className="dot active-dot" />Active ({activeCount})
        </button>
        <button className={filters.status === 'INACTIVE' ? 'active' : ''} onClick={() => setStatusTab('INACTIVE')}>
          <span className="dot inactive-dot" />Inactive ({inactiveCount})
        </button>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <input
            type="text"
            placeholder="Search by name..."
            value={filters.name}
            onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
        </div>
        <div className="toolbar-right">
          <input placeholder="City" value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} style={{ padding: '0.5rem 0.7rem', border: '1px solid #d8dce3', borderRadius: 8 }} />
          <select value={filters.kycStatus} onChange={(e) => setFilters((f) => ({ ...f, kycStatus: e.target.value }))}>
            <option value="">Any KYC status</option>
            <option value="PENDING">PENDING</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
          <label className="hint">From <input type="date" value={filters.createdFrom} onChange={(e) => setFilters((f) => ({ ...f, createdFrom: e.target.value }))} /></label>
          <label className="hint">To <input type="date" value={filters.createdTo} onChange={(e) => setFilters((f) => ({ ...f, createdTo: e.target.value }))} /></label>
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
            <tr><th>Partner</th><th>Status</th><th>KYC</th><th>City</th><th>Contact</th></tr>
          </thead>
          <tbody>
            {pagedPartners.map((p) => (
              <tr key={p.partnerId} className="clickable" onClick={() => navigate(`/partners/${p.partnerId}`)}>
                <td>
                  <div className="primary-cell">{p.name}</div>
                  <div className="secondary-cell">{p.partnerId}</div>
                </td>
                <td><span className={`badge ${p.status.toLowerCase()}`}>{p.status}</span></td>
                <td>{p.kycStatus}</td>
                <td>{p.city || '-'}</td>
                <td className="secondary-cell">{p.email}</td>
              </tr>
            ))}
            {partners.length === 0 && <tr><td colSpan={5} className="hint">No partners match these filters.</td></tr>}
          </tbody>
        </table>

        {partners.length > 0 && (
          <div className="pagination-bar">
            <span className="hint">
              Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, partners.length)} of {partners.length} entries
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
