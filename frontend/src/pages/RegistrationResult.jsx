import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { raiseDispute } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/timezone';
import { PERMISSIONS } from '../utils/permissions';

// Register Lead's outcome. Accepted: the new lead and its protection window.
// Refused as a duplicate: when protection runs out - never who holds it
// (section 52) - and, for anyone who may register leads, the option to
// dispute ownership with the customer just entered (section 62).
const DISPUTE_CUSTOMER_FIELDS = ['name', 'mobile', 'email', 'alternateMobile'];
const MIN_REASON = 10;

function DisputeForm({ submitted, onRaised }) {
  const { t } = useTranslation(['leads', 'common']);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!open) {
    return <button className="secondary" onClick={() => setOpen(true)}>{t('leads:disputes.raise')}</button>;
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const customer = {};
      for (const key of DISPUTE_CUSTOMER_FIELDS) if (submitted.customer?.[key]) customer[key] = submitted.customer[key];
      const { data } = await raiseDispute({ customer, projectId: submitted.projectId, reason: reason.trim() });
      onRaised(data);
    } catch (err) {
      const data = err.response?.data;
      // NOT_PROTECTED: protection ended in the meantime - say so plainly.
      setError(data?.code === 'NOT_PROTECTED' ? t('leads:disputes.notProtected') : data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  const tooShort = reason.trim().length < MIN_REASON;
  return (
    <form onSubmit={submit} style={{ marginTop: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>{t('leads:disputes.raiseTitle')}</h3>
      <p className="hint">{t('leads:disputes.raiseHint')}</p>
      {error && <div className="error-box">{error}</div>}
      <div className="field">
        <label htmlFor="dispute-reason">{t('leads:disputes.reasonLabel')} *</label>
        <textarea id="dispute-reason" rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        <span className="hint">{t('leads:disputes.reasonMin', { count: MIN_REASON })}</span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className="primary" type="submit" disabled={busy || tooShort}>{busy ? t('common:actions.saving') : t('leads:disputes.submit')}</button>
        <button className="secondary" type="button" onClick={() => setOpen(false)}>{t('common:actions.cancel')}</button>
      </div>
    </form>
  );
}

export default function RegistrationResult() {
  const { t } = useTranslation(['leads', 'common']);
  const { state } = useLocation();
  const { partner, hasPermission } = useAuth();
  const [dispute, setDispute] = useState(null);
  const result = state?.result;

  if (!result) {
    return (
      <div className="page">
        <div className="card">
          <p className="hint">{t('leads:result.none')}</p>
          <Link to="/register-lead"><button className="primary">{t('leads:list.addLead')}</button></Link>
        </div>
      </div>
    );
  }

  const accepted = result.status === 'ACCEPTED';
  const duplicate = result.reasonCode === 'DUPLICATE_PROTECTED';

  return (
    <div className="page">
      <h1>{accepted ? t('leads:result.acceptedTitle') : t('leads:result.rejectedTitle')}</h1>
      <div className="card">
        {accepted ? (
          <>
            <dl className="kv">
              <dt>{t('leads:list.registrationId')}</dt>
              <dd>{result.registrationId}</dd>
              <dt>{t('leads:result.protectionWindow')}</dt>
              <dd>{t('leads:project.protectionDays', { count: result.protectionDays })}</dd>
              <dt>{t('leads:result.protectedUntil')}</dt>
              <dd>{formatDate(result.expiryDate, partner.timezone)}</dd>
            </dl>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <Link to={`/registrations/${result.registrationId}`}><button className="primary">{t('leads:result.openLead')}</button></Link>
              <Link to="/register-lead"><button className="secondary">{t('leads:result.addAnother')}</button></Link>
            </div>
          </>
        ) : (
          <>
            <p><span className="badge rejected">{duplicate ? t('leads:result.duplicate') : result.reasonCode}</span></p>
            <p>{duplicate ? t('leads:result.duplicateHint') : result.reason}</p>
            {result.protectedUntil && (
              <dl className="kv">
                <dt>{t('leads:result.existingProtectedUntil')}</dt>
                <dd>{formatDate(result.protectedUntil, partner.timezone)}</dd>
              </dl>
            )}
            {dispute ? (
              <div className="info-box" style={{ marginTop: '1rem' }}>
                {t('leads:disputes.raised', { id: dispute.disputeId })} <Link to="/disputes">{t('leads:disputes.viewAll')}</Link>
              </div>
            ) : (
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {duplicate && state.submitted && hasPermission(PERMISSIONS.MANAGE_LEADS) && (
                  <div style={{ flexBasis: '100%' }}><DisputeForm submitted={state.submitted} onRaised={setDispute} /></div>
                )}
                <Link to="/my-leads"><button className="secondary">{t('leads:journey.backToMyLeads')}</button></Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
