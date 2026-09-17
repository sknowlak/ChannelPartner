import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getPartner, getPartnerActivity, listFieldDefinitions, updatePartner } from '../api/client';
import PartnerForm from '../components/PartnerForm';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';

export default function PartnerDetail() {
  const { partnerId } = useParams();
  const { timezone } = useAuth();
  const [data, setData] = useState(null);
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const navigate = useNavigate();

  const load = () => {
    Promise.all([getPartner(partnerId), listFieldDefinitions(), getPartnerActivity(partnerId)])
      .then(([{ data: d }, { data: fd }, { data: act }]) => {
        setData(d);
        setFieldDefinitions(fd.definitions);
        setActivity(act.events);
        setForm({ ...d.partner, customFields: d.partner.customFields || {} });
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  useEffect(load, [partnerId]);

  const toggleStatus = async () => {
    setBusy(true);
    try {
      const nextStatus = data.partner.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await updatePartner(partnerId, { status: nextStatus });
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updatePartner(partnerId, form);
      setEditing(false);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!data || !form) return <div className="page">Loading...</div>;

  const { partner, registrations, commissionSummary } = data;

  return (
    <div className="page">
      <h1>{partner.name}</h1>
      <div className="card">
        <dl className="kv">
          <dt>Partner ID</dt><dd>{partner.partnerId}</dd>
          <dt>Partner Code</dt><dd>{partner.partnerCode}</dd>
          <dt>Status</dt><dd><span className={`badge ${partner.status.toLowerCase()}`}>{partner.status}</span></dd>
          <dt>KYC Status</dt><dd>{partner.kycStatus}</dd>
          <dt>Approval Status</dt><dd>{partner.approvalStatus}</dd>
          <dt>Created By</dt><dd>{partner.createdBy || '-'}</dd>
          <dt>Total Registrations</dt><dd>{registrations.length}</dd>
          <dt>Commission Eligible</dt><dd>{commissionSummary.eligible} / {commissionSummary.total}</dd>
        </dl>
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
          <button className={partner.status === 'ACTIVE' ? 'danger' : 'primary'} disabled={busy} onClick={toggleStatus}>
            {partner.status === 'ACTIVE' ? 'Deactivate Partner' : 'Activate Partner'}
          </button>
          <button className="secondary" onClick={() => setEditing((e) => !e)}>{editing ? 'Cancel Edit' : 'Edit Details'}</button>
        </div>
      </div>

      {editing && (
        <form className="card" onSubmit={handleSave}>
          <PartnerForm fieldDefinitions={fieldDefinitions} values={form} onChange={setForm} mode="edit" />
          <div className="field">
            <label>KYC Status</label>
            <select value={form.kycStatus} onChange={(e) => setForm((f) => ({ ...f, kycStatus: e.target.value }))}>
              <option value="PENDING">PENDING</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save Changes'}</button>
        </form>
      )}

      <div className="card">
        <h3>Registrations</h3>
        <table>
          <thead><tr><th>Registration ID</th><th>Project</th><th>Status</th><th>Stage</th><th>Booked</th></tr></thead>
          <tbody>
            {registrations.map((r) => (
              <tr key={r.registrationId} className="clickable" onClick={() => navigate(`/registrations/${r.registrationId}`)}>
                <td>{r.registrationId}</td>
                <td>{r.projectId}</td>
                <td><span className={`badge ${r.status.toLowerCase()}`}>{r.status}</span></td>
                <td>{r.currentStage}</td>
                <td>{r.isBooked ? 'Yes' : 'No'}</td>
              </tr>
            ))}
            {registrations.length === 0 && <tr><td colSpan={5} className="hint">No registrations yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Activity History</h3>
        <ul className="timeline">
          {activity.map((ev) => (
            <li key={ev.auditId}>
              <div className="ts">{formatDateTime(ev.timestamp, timezone)} — {ev.actor}</div>
              <div>{ev.description}</div>
            </li>
          ))}
          {activity.length === 0 && <p className="hint">No activity recorded yet.</p>}
        </ul>
      </div>

      <Link to="/partners"><button className="secondary">Back to Partners</button></Link>
    </div>
  );
}
