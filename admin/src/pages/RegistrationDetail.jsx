import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRegistration, getRegistrationAudit, overrideRegistration } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';
import { errorMessage } from '../utils/errors';
import { enumLabel } from '../i18n/enumLabels';

const OVERRIDE_ACTIONS = ['RELEASE_PROTECTION', 'REASSIGN_PARTNER'];

export default function RegistrationDetail() {
  const { registrationId } = useParams();
  const { timezone } = useAuth();
  const { t } = useTranslation(['registrations', 'common', 'enums']);
  const [detail, setDetail] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ action: 'RELEASE_PROTECTION', newPartnerId: '', reason: '' });

  const load = () => {
    Promise.all([getRegistration(registrationId), getRegistrationAudit(registrationId)])
      .then(([{ data: d }, { data: a }]) => {
        setDetail(d);
        setEvents(a.events);
      })
      .catch((err) => setError(errorMessage(err)));
  };

  useEffect(load, [registrationId]);

  const handleOverride = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await overrideRegistration(registrationId, overrideForm);
      setOverrideForm((f) => ({ ...f, reason: '' }));
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!detail) return <div className="page">{t('common:states.loading')}</div>;

  const { registration, customer, ownership, booking, commission } = detail;

  return (
    <div className="page">
      <h1>{registrationId}</h1>

      <div className="card">
        <h3>{t('registrations:detail.registrationTitle')}</h3>
        <dl className="kv">
          <dt>{t('registrations:detail.customer')}</dt><dd>{customer?.name} ({customer?.mobile}{customer?.email ? `, ${customer.email}` : ''})</dd>
          <dt>{t('registrations:detail.partner')}</dt><dd>{registration.partnerId}</dd>
          <dt>{t('registrations:detail.project')}</dt><dd>{registration.projectId}</dd>
          <dt>{t('registrations:detail.status')}</dt><dd><span className={`badge ${registration.status.toLowerCase()}`}>{enumLabel('registrationStatus', registration.status)}</span></dd>
          <dt>{t('registrations:detail.currentStage')}</dt><dd>{registration.currentStage}</dd>
          <dt>{t('registrations:detail.protectionExpiry')}</dt><dd>{formatDateTime(registration.protectionExpiry, timezone)}</dd>
          <dt>{t('registrations:detail.booked')}</dt><dd>{registration.isBooked ? t('common:status.yes') : t('common:status.no')}</dd>
          <dt>{t('registrations:detail.workingOwner')}</dt><dd>{ownership?.workingOwner}</dd>
          <dt>{t('registrations:detail.operationalOwner')}</dt><dd>{ownership?.operationalOwner}</dd>
          {booking && <><dt>{t('registrations:detail.bookingId')}</dt><dd>{booking.bookingId}</dd></>}
          {commission && <><dt>{t('registrations:detail.commissionEligibility')}</dt><dd><span className="badge eligible">{enumLabel('eligibilityStatus', commission.eligibilityStatus)}</span></dd></>}
        </dl>
      </div>

      <div className="card">
        <h3>{t('registrations:detail.override.title')}</h3>
        <p className="hint">{t('registrations:detail.override.hint')}</p>
        <form onSubmit={handleOverride}>
          <div className="field">
            <label htmlFor="override-action">{t('registrations:detail.override.action')}</label>
            <select id="override-action" value={overrideForm.action} onChange={(e) => setOverrideForm((f) => ({ ...f, action: e.target.value }))}>
              {OVERRIDE_ACTIONS.map((a) => <option key={a} value={a}>{enumLabel('overrideAction', a)}</option>)}
            </select>
          </div>
          {overrideForm.action === 'REASSIGN_PARTNER' && (
            <div className="field">
              <label htmlFor="override-new-partner">{t('registrations:detail.override.newPartnerId')}</label>
              <input id="override-new-partner" value={overrideForm.newPartnerId} onChange={(e) => setOverrideForm((f) => ({ ...f, newPartnerId: e.target.value }))} required />
            </div>
          )}
          <div className="field">
            <label htmlFor="override-reason">{t('registrations:detail.override.reason')}</label>
            <input id="override-reason" value={overrideForm.reason} onChange={(e) => setOverrideForm((f) => ({ ...f, reason: e.target.value }))} required />
          </div>
          <button className="primary" type="submit" disabled={busy}>{busy ? t('registrations:detail.override.applying') : t('registrations:detail.override.apply')}</button>
        </form>
      </div>

      <div className="card">
        <h3>{t('registrations:detail.timelineTitle')}</h3>
        <ul className="timeline">
          {events.map((ev) => (
            <li key={ev.auditId}>
              <div className="ts">{formatDateTime(ev.timestamp, timezone)} — {ev.actor}</div>
              <div>{ev.description}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
