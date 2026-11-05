import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRegistration, getRegistrationAudit, overrideRegistration } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/timezone';
import { errorMessage } from '../utils/errors';
import { enumLabel } from '../i18n/enumLabels';

const OVERRIDE_ACTIONS = ['RELEASE_PROTECTION', 'REASSIGN_PARTNER'];
// Only offered while the registration is booked (section 62).
const BOOKED_ACTIONS = ['CANCEL_BOOKING'];

// Badge colour per booking / commission status (reuses the badge classes).
const statusBadge = (status) => ({ CONFIRMED: 'accepted', ELIGIBLE: 'eligible', ATTRIBUTED: 'accepted', PENDING: 'pending', DISPUTED: 'pending' }[status] || 'rejected');

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
    // Cancelling a booking also cancels its commission - ask once more.
    if (overrideForm.action === 'CANCEL_BOOKING' && !window.confirm(t('registrations:detail.override.cancelBookingConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      await overrideRegistration(registrationId, overrideForm);
      setOverrideForm((f) => ({ ...f, action: 'RELEASE_PROTECTION', reason: '' }));
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (error && !detail) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!detail) return <div className="page">{t('common:states.loading')}</div>;

  const { registration, customer, ownership, booking, commission } = detail;
  const actions = registration.isBooked ? [...OVERRIDE_ACTIONS, ...BOOKED_ACTIONS] : OVERRIDE_ACTIONS;
  const bookingCancelled = booking?.status === 'CANCELLED';

  return (
    <div className="page">
      <h1>{registrationId}</h1>
      {error && <div className="error-box">{error}</div>}
      {registration.disputeStatus === 'OPEN' && (
        <div className="warn-box">
          {t('registrations:detail.disputeOpen')} <Link to="/disputes">{t('registrations:detail.viewDisputes')}</Link>
        </div>
      )}

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
          {booking?.status && <><dt>{t('registrations:detail.bookingStatus')}</dt><dd><span className={`badge ${statusBadge(booking.status)}`}>{enumLabel('bookingStatus', booking.status)}</span></dd></>}
          {commission && <><dt>{t('registrations:detail.commissionEligibility')}</dt><dd><span className={`badge ${statusBadge(commission.eligibilityStatus)}`}>{enumLabel('eligibilityStatus', commission.eligibilityStatus)}</span></dd></>}
          {commission?.attributionStatus && <><dt>{t('registrations:detail.commissionAttribution')}</dt><dd><span className={`badge ${statusBadge(commission.attributionStatus)}`}>{enumLabel('attributionStatus', commission.attributionStatus)}</span></dd></>}
        </dl>
      </div>

      {bookingCancelled && (
        <div className="card">
          <h3>{t('registrations:detail.cancellation.title')}</h3>
          <p className="hint">{t('registrations:detail.cancellation.hint')}</p>
          <dl className="kv">
            <dt>{t('registrations:detail.cancellation.at')}</dt><dd>{formatDateTime(booking.cancelledAt, timezone)}</dd>
            <dt>{t('registrations:detail.cancellation.by')}</dt><dd>{booking.cancelledBy || '-'}</dd>
            <dt>{t('registrations:detail.cancellation.reason')}</dt><dd>{booking.cancellationReason || '-'}</dd>
          </dl>
        </div>
      )}

      <div className="card">
        <h3>{t('registrations:detail.override.title')}</h3>
        <p className="hint">{t('registrations:detail.override.hint')}</p>
        <form onSubmit={handleOverride}>
          <div className="field">
            <label htmlFor="override-action">{t('registrations:detail.override.action')}</label>
            <select id="override-action" value={overrideForm.action} onChange={(e) => setOverrideForm((f) => ({ ...f, action: e.target.value }))}>
              {actions.map((a) => <option key={a} value={a}>{enumLabel('overrideAction', a)}</option>)}
            </select>
          </div>
          {overrideForm.action === 'REASSIGN_PARTNER' && (
            <div className="field">
              <label htmlFor="override-new-partner">{t('registrations:detail.override.newPartnerId')}</label>
              <input id="override-new-partner" value={overrideForm.newPartnerId} onChange={(e) => setOverrideForm((f) => ({ ...f, newPartnerId: e.target.value }))} required />
            </div>
          )}
          {overrideForm.action === 'CANCEL_BOOKING' && <div className="warn-box">{t('registrations:detail.override.cancelBookingHint')}</div>}
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
