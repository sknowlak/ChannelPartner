import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPartner, getPartnerActivity, listFieldDefinitions, updatePartner } from '../api/client';
import PartnerForm from '../components/PartnerForm';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';
import { errorMessage } from '../utils/errors';
import { formatNumber } from '../i18n/format';
import { enumLabel } from '../i18n/enumLabels';

const KYC_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'];

export default function PartnerDetail() {
  const { partnerId } = useParams();
  const { timezone } = useAuth();
  const { t } = useTranslation(['partners', 'common', 'enums']);
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
      .catch((err) => setError(errorMessage(err)));
  };

  useEffect(load, [partnerId]);

  const toggleStatus = async () => {
    setBusy(true);
    try {
      const nextStatus = data.partner.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await updatePartner(partnerId, { status: nextStatus });
      load();
    } catch (err) {
      setError(errorMessage(err));
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
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!data || !form) return <div className="page">{t('common:states.loading')}</div>;

  const { partner, registrations, commissionSummary } = data;

  return (
    <div className="page">
      <h1>{partner.name}</h1>
      <div className="card">
        <dl className="kv">
          <dt>{t('partners:detail.partnerId')}</dt><dd>{partner.partnerId}</dd>
          <dt>{t('partners:detail.partnerCode')}</dt><dd>{partner.partnerCode}</dd>
          <dt>{t('partners:detail.status')}</dt><dd><span className={`badge ${partner.status.toLowerCase()}`}>{enumLabel('status', partner.status)}</span></dd>
          <dt>{t('partners:detail.kycStatus')}</dt><dd>{enumLabel('kycStatus', partner.kycStatus)}</dd>
          <dt>{t('partners:detail.approvalStatus')}</dt><dd>{enumLabel('approvalStatus', partner.approvalStatus)}</dd>
          <dt>{t('partners:detail.createdBy')}</dt><dd>{partner.createdBy || '-'}</dd>
          <dt>{t('partners:detail.totalRegistrations')}</dt><dd>{formatNumber(registrations.length)}</dd>
          <dt>{t('partners:detail.commissionEligible')}</dt><dd>{t('partners:detail.commissionEligibleValue', { eligible: formatNumber(commissionSummary.eligible), total: formatNumber(commissionSummary.total) })}</dd>
        </dl>
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
          <button className={partner.status === 'ACTIVE' ? 'danger' : 'primary'} disabled={busy} onClick={toggleStatus}>
            {partner.status === 'ACTIVE' ? t('partners:detail.deactivate') : t('partners:detail.activate')}
          </button>
          <button className="secondary" onClick={() => setEditing((e) => !e)}>{editing ? t('partners:detail.cancelEdit') : t('partners:detail.editDetails')}</button>
        </div>
      </div>

      {editing && (
        <form className="card" onSubmit={handleSave}>
          <PartnerForm fieldDefinitions={fieldDefinitions} values={form} onChange={setForm} mode="edit" />
          <div className="field">
            <label htmlFor="partner-kyc-status">{t('partners:detail.kycStatus')}</label>
            <select id="partner-kyc-status" value={form.kycStatus} onChange={(e) => setForm((f) => ({ ...f, kycStatus: e.target.value }))}>
              {KYC_STATUSES.map((s) => <option key={s} value={s}>{enumLabel('kycStatus', s)}</option>)}
            </select>
          </div>
          <button className="primary" type="submit" disabled={busy}>{busy ? t('common:actions.saving') : t('common:actions.saveChanges')}</button>
        </form>
      )}

      <div className="card">
        <h3>{t('partners:detail.registrationsTitle')}</h3>
        <table>
          <thead><tr>{['registrationId', 'project', 'status', 'stage', 'booked'].map((k) => <th key={k}>{t(`partners:detail.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {registrations.map((r) => (
              <tr key={r.registrationId} className="clickable" onClick={() => navigate(`/registrations/${r.registrationId}`)}>
                <td>{r.registrationId}</td>
                <td>{r.projectId}</td>
                <td><span className={`badge ${r.status.toLowerCase()}`}>{enumLabel('registrationStatus', r.status)}</span></td>
                <td>{r.currentStage}</td>
                <td>{r.isBooked ? t('common:status.yes') : t('common:status.no')}</td>
              </tr>
            ))}
            {registrations.length === 0 && <tr><td colSpan={5} className="hint">{t('partners:detail.noRegistrations')}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>{t('partners:detail.activityTitle')}</h3>
        <ul className="timeline">
          {activity.map((ev) => (
            <li key={ev.auditId}>
              <div className="ts">{formatDateTime(ev.timestamp, timezone)} — {ev.actor}</div>
              <div>{ev.description}</div>
            </li>
          ))}
          {activity.length === 0 && <p className="hint">{t('partners:detail.noActivity')}</p>}
        </ul>
      </div>

      <Link to="/partners"><button className="secondary">{t('partners:detail.back')}</button></Link>
    </div>
  );
}
