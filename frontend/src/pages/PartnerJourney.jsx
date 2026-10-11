import { Fragment, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getMyRegistration, getMyRegistrationAudit, listLeadFields } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime } from '../utils/timezone';
import { sortLeadTabs } from '../utils/leadTabs';
import { PERMISSIONS } from '../utils/permissions';
import LeadQuickUpdate, { useLeadWorkflowOptions } from '../components/LeadQuickUpdate';

function fieldValue(def, registration, customer) {
  if (def.scope === 'customer') return customer?.[def.fieldKey];
  if (def.scope === 'registration') return registration[def.fieldKey];
  return registration.customFields?.[def.fieldKey];
}

// Where the referral stands with the builder (section 52).
const REFERRAL_LABEL = {
  NOT_REFERRED: 'Not referred (no project)',
  PENDING_BUILDER: 'Waiting for builder',
  ACCEPTED: 'Accepted by builder',
  REJECTED: 'Rejected by builder'
};
const REFERRAL_BADGE = { NOT_REFERRED: 'pending', PENDING_BUILDER: 'pending', ACCEPTED: 'accepted', REJECTED: 'rejected' };

function formatFieldValue(def, value) {
  if (value === undefined || value === null || value === '') return '-';
  if (def.dataType === 'LIST') return Array.isArray(value) ? value.join(', ') : String(value);
  if (def.dataType === 'NUMBER') return Number(value).toLocaleString();
  return String(value);
}

// Ownership-enforced version of the partner journey screen - fetches/updates
// through /my/registrations/:id, so this only ever works for leads owned by
// the logged-in partner (spec section 31). The "Lead Details" card below the
// operational summary renders every enabled field the partner has configured
// (section 40, "get Leads" should show all the fields too) - same tab
// grouping as Add/Edit Lead, just read-only.
export default function PartnerJourney() {
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
  if (!detail || !fieldDefs) return <div className="page">Loading...</div>;

  const { registration, customer, ownership } = detail;
  const tabs = sortLeadTabs([...new Set(fieldDefs.map((f) => f.group))]);

  return (
    <div className="page page-wide">
      <h1>{registrationId}</h1>
      <div className="card">
        <dl className="kv">
          <dt>Customer</dt>
          <dd>{customer.name} ({customer.mobile})</dd>
          <dt>Project</dt>
          <dd>{registration.projectId}</dd>
          <dt>Current Owner</dt>
          <dd>{ownership ? ownership.workingOwner : registration.partnerId}</dd>
          <dt>Protection Expiry</dt>
          <dd>{formatDate(registration.protectionExpiry, partner.timezone)}</dd>
          <dt>Lead Status</dt>
          <dd>{registration.currentStage}{registration.subStatus ? ` - ${registration.subStatus}` : ''}</dd>
          {registration.scheduledAt && (
            <>
              <dt>Scheduled</dt>
              <dd>{formatDateTime(registration.scheduledAt, partner.timezone)}</dd>
            </>
          )}
          <dt>Assigned To</dt>
          <dd>{detail.assignedToName || 'Unassigned'}</dd>
          <dt>Referral</dt>
          <dd>
            <span className={`badge ${REFERRAL_BADGE[registration.referralStatus] || 'pending'}`}>{REFERRAL_LABEL[registration.referralStatus] || registration.referralStatus}</span>
            {registration.referralDecision?.reason && <div className="hint" style={{ marginTop: '0.3rem' }}>Builder's reason: {registration.referralDecision.reason}</div>}
          </dd>
        </dl>

        {registration.isBooked
          ? <p className="hint">Booked by the builder - operational ownership has moved to the builder; your attribution and commission eligibility are kept.</p>
          : <p className="hint">Bookings are confirmed by the builder once they accept the referral.</p>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Quick Update</h3>
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
        ) : <p className="hint">Loading...</p>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Lead Details</h3>
        <div className="status-tabs">
          {tabs.map((tab) => (
            <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </div>
        {tabs.map((tab) => (
          <dl className="kv" key={tab} style={{ display: activeTab === tab ? 'grid' : 'none' }}>
            {fieldDefs.filter((f) => f.group === tab).map((def) => (
              <Fragment key={def.fieldKey}>
                <dt>{def.label}</dt>
                <dd>{formatFieldValue(def, fieldValue(def, registration, customer))}</dd>
              </Fragment>
            ))}
          </dl>
        ))}
      </div>

      <div className="card">
        <h3>Progress History <span className="hint">(times in {partner.timezone})</span></h3>
        <ul className="timeline">
          {events.map((ev) => (
            <li key={ev.auditId}>
              <div className="ts">
                {formatDateTime(ev.timestamp, partner.timezone)} · {ev.actor === 'SYSTEM' ? 'System' : ev.actor} · {ev.platform || (ev.actor === 'SYSTEM' ? 'System' : '-')}
              </div>
              <div>{ev.description}</div>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <Link to="/my-leads"><button className="secondary">Back to My Leads</button></Link>
        <Link to={`/registrations/${registrationId}/edit`}><button className="secondary">Edit Lead</button></Link>
      </div>
    </div>
  );
}
