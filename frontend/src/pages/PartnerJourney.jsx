import { Fragment, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getMyRegistration, getMyRegistrationAudit, listLeadFields } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime } from '../utils/timezone';
import { sortLeadTabs } from '../utils/leadTabs';
import { PERMISSIONS } from '../utils/permissions';
import LeadQuickUpdate, { useLeadWorkflowOptions } from '../components/LeadQuickUpdate';
import { actorLabel, describeEvent, platformLabel } from '../components/LeadHistoryModal';
import { formatNumber } from '../i18n/format';
import { fieldLabel, groupLabel, optionLabel, statusLabel, subStatusLabel, useDataLabels } from '../i18n/dataLabels';

function fieldValue(def, registration, customer) {
  if (def.scope === 'customer') return customer?.[def.fieldKey];
  if (def.scope === 'registration') return registration[def.fieldKey];
  return registration.customFields?.[def.fieldKey];
}

// Where the referral stands with the builder (section 52). Labels are
// leads:referral.<STATUS>; the enum value itself is never translated.
const REFERRAL_STATUSES = new Set(['NOT_REFERRED', 'PENDING_BUILDER', 'ACCEPTED', 'REJECTED']);
const REFERRAL_BADGE = { NOT_REFERRED: 'pending', PENDING_BUILDER: 'pending', ACCEPTED: 'accepted', REJECTED: 'rejected' };

function formatFieldValue(def, value) {
  if (value === undefined || value === null || value === '') return '-';
  if (def.dataType === 'LIST') return Array.isArray(value) ? value.map((v) => optionLabel(v)).join(', ') : String(optionLabel(value));
  if (def.dataType === 'NUMBER') return formatNumber(value);
  if (def.dataType === 'SELECT') return String(optionLabel(value));
  return String(value);
}

// Ownership-enforced version of the partner journey screen - fetches/updates
// through /my/registrations/:id, so this only ever works for leads owned by
// the logged-in partner (spec section 31). The "Lead Details" card below the
// operational summary renders every enabled field the partner has configured
// (section 40, "get Leads" should show all the fields too) - same tab
// grouping as Add/Edit Lead, just read-only.
export default function PartnerJourney() {
  const { t } = useTranslation(['leads', 'common']);
  useDataLabels();
  const { registrationId } = useParams();
  const { partner, hasPermission } = useAuth();
  const workflowOptions = useLeadWorkflowOptions();
  const canEdit = hasPermission(PERMISSIONS.MANAGE_LEADS);
  const [detail, setDetail] = useState(null);
  const [fieldDefs, setFieldDefs] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const [{ data: d }, { data: audit }, { data: fieldData }] = await Promise.all([
        getMyRegistration(registrationId),
        getMyRegistrationAudit(registrationId),
        listLeadFields()
      ]);
      setDetail(d);
      setEvents(audit.events);
      const enabled = fieldData.definitions.filter((f) => f.isEnabled);
      setFieldDefs(enabled);
      setActiveTab((t) => t || sortLeadTabs([...new Set(enabled.map((f) => f.group))])[0]);
    } catch (err) {
      setError(err.response ? err.response.data.reason : err.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationId]);


  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!detail || !fieldDefs) return <div className="page">{t('common:states.loading')}</div>;

  const { registration, customer, ownership } = detail;
  const tabs = sortLeadTabs([...new Set(fieldDefs.map((f) => f.group))]);

  return (
    <div className="page page-wide">
      <h1>{registrationId}</h1>
      <div className="card">
        <dl className="kv">
          <dt>{t('leads:journey.customer')}</dt>
          <dd>{customer.name} ({customer.mobile})</dd>
          <dt>{t('common:fields.project')}</dt>
          <dd>{registration.projectId}</dd>
          <dt>{t('leads:journey.currentOwner')}</dt>
          <dd>{ownership ? ownership.workingOwner : registration.partnerId}</dd>
          <dt>{t('leads:journey.protectionExpiry')}</dt>
          <dd>{formatDate(registration.protectionExpiry, partner.timezone)}</dd>
          <dt>{t('leads:journey.leadStatus')}</dt>
          <dd>{statusLabel(registration.currentStage)}{registration.subStatus ? ` - ${subStatusLabel(registration.subStatus)}` : ''}</dd>
          {registration.scheduledAt && (
            <>
              <dt>{t('leads:journey.scheduled')}</dt>
              <dd>{formatDateTime(registration.scheduledAt, partner.timezone)}</dd>
            </>
          )}
          <dt>{t('leads:journey.assignedTo')}</dt>
          <dd>{detail.assignedToName || t('leads:assign.unassigned')}</dd>
          <dt>{t('leads:journey.referral')}</dt>
          <dd>
            <span className={`badge ${REFERRAL_BADGE[registration.referralStatus] || 'pending'}`}>{REFERRAL_STATUSES.has(registration.referralStatus) ? t(`leads:referral.${registration.referralStatus}`) : registration.referralStatus}</span>
            {registration.referralDecision?.reason && <div className="hint" style={{ marginTop: '0.3rem' }}>{t('leads:journey.builderReason', { reason: registration.referralDecision.reason })}</div>}
          </dd>
        </dl>

        {registration.isBooked
          ? <p className="hint">{t('leads:journey.bookedHint')}</p>
          : <p className="hint">{t('leads:journey.notBookedHint')}</p>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('leads:journey.quickUpdate')}</h3>
        {workflowOptions.loaded ? (
          <LeadQuickUpdate
            lead={{ ...registration }}
            customer={customer}
            fieldDefs={workflowOptions.fieldDefs}
            timezone={partner.timezone}
            users={workflowOptions.users}
            statuses={workflowOptions.statuses}
            canEdit={canEdit}
            onUpdated={() => load()}
          />
        ) : <p className="hint">{t('common:states.loading')}</p>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('leads:journey.leadDetails')}</h3>
        <div className="status-tabs">
          {tabs.map((tab) => (
            <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
              {groupLabel(tab)}
            </button>
          ))}
        </div>
        {tabs.map((tab) => (
          <dl className="kv" key={tab} style={{ display: activeTab === tab ? 'grid' : 'none' }}>
            {fieldDefs.filter((f) => f.group === tab).map((def) => (
              <Fragment key={def.fieldKey}>
                <dt>{fieldLabel(def)}</dt>
                <dd>{formatFieldValue(def, fieldValue(def, registration, customer))}</dd>
              </Fragment>
            ))}
          </dl>
        ))}
      </div>

      <div className="card">
        <h3>{t('leads:journey.progressHistory')} <span className="hint">{t('leads:journey.timesIn', { timezone: partner.timezone })}</span></h3>
        <ul className="timeline">
          {events.map((ev) => (
            <li key={ev.auditId}>
              <div className="ts">
                {formatDateTime(ev.timestamp, partner.timezone)} · {actorLabel(ev.actor)} · {ev.platform ? platformLabel(ev.platform) : (ev.actor === 'SYSTEM' ? t('leads:history.system') : '-')}
              </div>
              <div>{describeEvent(ev)}</div>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <Link to="/my-leads"><button className="secondary">{t('leads:journey.backToMyLeads')}</button></Link>
        <Link to={`/registrations/${registrationId}/edit`}><button className="secondary">{t('leads:journey.editLead')}</button></Link>
      </div>
    </div>
  );
}
