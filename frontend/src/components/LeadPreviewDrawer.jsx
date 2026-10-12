import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDataLabels } from '../i18n/dataLabels';
import { getMyRegistration } from '../api/client';
import { formatDateTime } from '../utils/timezone';
import LeadQuickUpdate from './LeadQuickUpdate';

function Row({ label, children }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children || '-'}</dd>
    </>
  );
}

// Lead Preview (section 48) - opened from the My Leads grid without leaving
// it: who the lead is, how to reach them, and the quick assignment/status/
// note update, with links out to the full detail and edit screens.
// `options` comes from useLeadWorkflowOptions() in the parent so the grid
// and the drawer share one users/statuses fetch.
export default function LeadPreviewDrawer({ registrationId, timezone, options, canEdit, onClose, onUpdated, onShowHistory }) {
  const { t } = useTranslation(['leads', 'common']);
  const { optionLabel, statusLabel, subStatusLabel } = useDataLabels();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  const fetchDetail = () => getMyRegistration(registrationId)
    .then(({ data }) => setDetail(data))
    .catch((err) => setError(err.response?.data?.reason || err.message));

  useEffect(() => {
    setDetail(null);
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationId]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const applyPatch = ({ fieldsChanged, ...patch }) => {
    setDetail((d) => ({
      ...d,
      assignedToName: patch.assignedToName !== undefined ? patch.assignedToName : d.assignedToName,
      registration: { ...d.registration, ...patch }
    }));
    // Lead fields edited on the status form (section 49) - re-read the lead
    // so the details above show the saved values.
    if (fieldsChanged) fetchDetail();
    onUpdated?.(registrationId, patch, { fieldsChanged });
  };

  const reg = detail?.registration;
  const customer = detail?.customer;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" onClick={(e) => e.stopPropagation()} aria-label={t('leads:preview.ariaLabel')}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>{customer?.name || t('leads:preview.title')}</h3>
            <span className="hint">{registrationId}</span>
          </div>
          <button className="link" onClick={onClose}>{t('common:actions.close')}</button>
        </div>

        {error && <div className="error-box">{error}</div>}
        {!detail && !error && <p className="hint">{t('common:states.loading')}</p>}

        {detail && (
          <>
            <div className="preview-status">
              <span className="badge pending">{statusLabel(reg.currentStage)}{reg.subStatus ? ` · ${subStatusLabel(reg.subStatus)}` : ''}</span>
              <span className="hint">{detail.assignedToName ? t('leads:assign.assignedTo', { name: detail.assignedToName }) : t('leads:assign.unassigned')}</span>
            </div>

            <dl className="kv preview-kv">
              <Row label={t('common:fields.mobile')}>{customer?.mobile && <a href={`tel:${customer.mobile}`}>{customer.mobile}</a>}</Row>
              <Row label={t('common:fields.email')}>{customer?.email && <a href={`mailto:${customer.email}`}>{customer.email}</a>}</Row>
              <Row label={t('common:fields.project')}>{reg.projectId}</Row>
              <Row label={t('leads:preview.source')}>{optionLabel(reg.leadSource)}</Row>
              <Row label={t('leads:preview.location')}>{reg.preferredLocation}</Row>
              {reg.scheduledAt && <Row label={t('leads:preview.scheduled')}>{formatDateTime(reg.scheduledAt, timezone)}</Row>}
              <Row label={t('leads:preview.registered')}>{formatDateTime(reg.registeredAt, timezone)}</Row>
              <Row label={t('leads:preview.latestNote')}>{reg.notes}</Row>
            </dl>

            <h4 className="drawer-section-title">{t('leads:preview.quickUpdate')}</h4>
            {options.loaded ? (
              <LeadQuickUpdate
                lead={reg}
                customer={customer}
                users={options.users}
                statuses={options.statuses}
                fieldDefs={options.fieldDefs}
                timezone={timezone}
                canEdit={canEdit}
                onUpdated={applyPatch}
              />
            ) : <p className="hint">{t('common:states.loading')}</p>}

            <div className="drawer-footer">
              <button className="secondary" onClick={() => navigate(`/registrations/${registrationId}`)}>{t('leads:preview.fullDetails')}</button>
              {canEdit && <button className="secondary" onClick={() => navigate(`/registrations/${registrationId}/edit`)}>{t('leads:preview.editLead')}</button>}
              {onShowHistory && <button className="secondary" onClick={() => onShowHistory(registrationId)}>{t('leads:preview.history')}</button>}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
