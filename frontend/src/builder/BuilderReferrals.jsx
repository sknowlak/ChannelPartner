import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listBuilderProjects, listReferrals } from './builderClient';
import { REFERRAL_BADGE, REFERRAL_LABEL } from './referralLabels';

// Referrals for this builder's own projects only - the server scopes the
// list; nothing here filters for security.
export default function BuilderReferrals() {
  const [projects, setProjects] = useState([]);
  const [filters, setFilters] = useState({ projectId: '', referralStatus: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listBuilderProjects().then(({ data: d }) => setProjects(d.projects)).catch((err) => setError(err.response?.data?.reason || err.message));
  }, []);
  useEffect(() => {
    const params = { limit: 200 };
    if (filters.projectId) params.projectId = filters.projectId;
    if (filters.referralStatus) params.referralStatus = filters.referralStatus;
    listReferrals(params).then(({ data: d }) => setData(d)).catch((err) => setError(err.response?.data?.reason || err.message));
  }, [filters]);

  return (
    <div className="page page-wide">
      <h1>Referrals</h1>
      {error && <div className="error-box">{error}</div>}
      <div className="card">
        <div className="toolbar">
          <div className="toolbar-left">
            <select value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.name}</option>)}
            </select>
            <select value={filters.referralStatus} onChange={(e) => setFilters((f) => ({ ...f, referralStatus: e.target.value }))}>
              <option value="">All statuses</option>
              {Object.entries(REFERRAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {data && <span className="hint">{data.total} referral(s)</span>}
        </div>
        <div className="table-scroll">
          <table className="pro-table">
            <thead><tr><th>Referral</th><th>Customer</th><th>Project</th><th>Source Partner</th><th>Status</th><th>Booking</th><th>Registered</th></tr></thead>
            <tbody>
              {(data?.referrals || []).map((r) => (
                <tr key={r.registrationId}>
                  <td><Link to={`/builder/referrals/${r.registrationId}`}>{r.registrationId}</Link></td>
                  <td className="primary-cell">{r.customer || '-'}</td>
                  <td>{r.projectName}</td>
                  <td>{r.sourcePartner?.name}</td>
                  <td><span className={`badge ${REFERRAL_BADGE[r.referralStatus]}`}>{REFERRAL_LABEL[r.referralStatus]}</span></td>
                  <td>{r.isBooked ? 'Booked' : '-'}</td>
                  <td className="secondary-cell">{new Date(r.registeredAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {data && data.referrals.length === 0 && <tr><td colSpan={7} className="hint">No referrals yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {!data && !error && <p className="hint">Loading...</p>}
      </div>
    </div>
  );
}
