import { useEffect, useMemo, useState } from 'react';
import { getIntegrationApiKey, getMyProfile, listLeadFields, regenerateIntegrationApiKey } from '../api/client';
import SettingsCategories from '../components/SettingsCategories';
import IntegrationTabs from '../components/IntegrationTabs';
import { PERMISSIONS } from '../utils/permissions';

// Settings -> Integrations -> Your API (section 51): everything another
// system needs to talk to this account both ways - the key, every endpoint,
// copy-paste examples, and the OpenAPI document for import into Postman,
// Zapier, Make, n8n, etc.

// The create example must actually succeed when pasted, for whatever this
// partner has configured - so it's built from their real required fields.
function sampleValueFor(def) {
  switch (def.dataType) {
    case 'SELECT': return (def.options && def.options[0]) || 'Option';
    case 'NUMBER':
    case 'CURRENCY': return 1000;
    case 'DATE': return new Date().toISOString().slice(0, 10);
    case 'TEXTAREA': return 'Interested in 2BHK';
    default: return `Sample ${def.label}`;
  }
}
function buildExamplePayload(fieldDefs) {
  const customer = { name: 'Jane Doe', mobile: '+919876543210' };
  const rest = {};
  for (const def of fieldDefs) {
    if (!def.isRequired || def.fieldKey === 'name' || def.fieldKey === 'mobile') continue;
    if (def.scope === 'customer') customer[def.fieldKey] = sampleValueFor(def);
    else rest[def.fieldKey] = sampleValueFor(def);
  }
  return { customer, ...rest, externalReferenceId: 'YOUR-ID-123' };
}

const ENDPOINTS = [
  ['POST', '/integrations/leads', 'Create a lead (send your own ID as externalReferenceId - repeats never duplicate)'],
  ['GET', '/integrations/leads?updatedSince=2026-01-01T00:00:00Z&page=1&limit=50', 'List leads changed since a time, oldest first - for incremental sync'],
  ['GET', '/integrations/leads?externalReferenceId=YOUR-ID-123', 'Find a lead by your own ID'],
  ['GET', '/integrations/leads/:registrationId', 'Get one lead'],
  ['PATCH', '/integrations/leads/:registrationId', 'Update lead fields'],
  ['POST', '/integrations/leads/:registrationId/progress', 'Change status / sub-status / schedule / note'],
  ['POST', '/integrations/leads/:registrationId/booking', 'Complete the booking'],
  ['GET', '/integrations/lead-statuses', 'Your status pipeline'],
  ['GET', '/integrations/lead-fields', 'Every field a lead can carry, and where it goes in the request'],
  ['POST', '/integrations/subscriptions', 'Subscribe a URL to lead events: {"targetUrl": "...", "events": ["LEAD_CREATED", "STAGE_UPDATED"]}'],
  ['GET', '/integrations/subscriptions', 'List event subscriptions'],
  ['DELETE', '/integrations/subscriptions/:subscriptionId', 'Unsubscribe']
];

export default function IntegrationApi() {
  const [permissions, setPermissions] = useState(null);
  const [info, setInfo] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [fieldDefs, setFieldDefs] = useState([]);
  const [error, setError] = useState(null);

  const canManage = (permissions || []).includes(PERMISSIONS.MANAGE_SETTINGS);

  useEffect(() => {
    Promise.all([getMyProfile(), listLeadFields()])
      .then(async ([{ data: me }, { data: fields }]) => {
        const perms = me.permissions || [];
        setPermissions(perms);
        setFieldDefs(fields.definitions.filter((d) => d.isEnabled));
        // The key acts as the whole organisation - only MANAGE_SETTINGS can see it.
        if (perms.includes(PERMISSIONS.MANAGE_SETTINGS)) setInfo((await getIntegrationApiKey()).data);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, []);

  const base = info ? info.inboundLeadUrl.replace(/\/integrations\/leads$/, '') : `${window.location.origin}/api/channel-partner`;
  const shownKey = info ? (showKey ? info.apiKey : `${info.apiKey.slice(0, 7)}${'•'.repeat(20)}`) : 'YOUR_API_KEY';
  const example = useMemo(() => buildExamplePayload(fieldDefs), [fieldDefs]);
  const copy = (text) => navigator.clipboard?.writeText(text).catch(() => {});

  const regenerate = async () => {
    if (!window.confirm('Regenerate the API key? Every system using the old key stops working immediately.')) return;
    try {
      const { data } = await regenerateIntegrationApiKey();
      setInfo((i) => ({ ...i, apiKey: data.apiKey }));
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const createCurl = `curl -X POST ${base}/integrations/leads \\\n  -H "X-Api-Key: ${shownKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(example)}'`;
  const listCurl = `curl "${base}/integrations/leads?updatedSince=2026-01-01T00:00:00Z&limit=50" \\\n  -H "X-Api-Key: ${shownKey}"`;
  const subscribeCurl = `curl -X POST ${base}/integrations/subscriptions \\\n  -H "X-Api-Key: ${shownKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"targetUrl":"https://your-system.example.com/leadrat-events","events":["LEAD_CREATED","STAGE_UPDATED","BOOKING_COMPLETED"]}'`;

  return (
    <div className="page page-wide">
      <div>
        <h1 style={{ marginBottom: '0.2rem' }}>Settings</h1>
        <p className="hint" style={{ margin: 0 }}>Connect any system: push leads out, receive or pull them in, and let other systems use your API.</p>
      </div>
      <SettingsCategories />
      <IntegrationTabs />
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h3 className="form-section-title" style={{ marginTop: 0 }}><span>Your API - Two-Way Access for Any System</span></h3>
        <p className="hint">
          Any system with your API key can create, read and update leads and subscribe to lead events. Send the key in the{' '}
          <code>X-Api-Key</code> header, as <code>Authorization: Bearer &lt;key&gt;</code>, or (if the tool can't set headers) as{' '}
          <code>?api_key=&lt;key&gt;</code>. Limit: 600 requests per minute.
        </p>
        {permissions && !canManage && <p className="hint">Only someone with the Manage Settings permission can view the API key.</p>}
        {info && (
          <div className="field">
            <label>API Key</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input value={shownKey} readOnly style={{ flex: 1, fontFamily: 'monospace' }} />
              <button type="button" className="secondary" onClick={() => setShowKey((s) => !s)}>{showKey ? 'Hide' : 'Show'}</button>
              <button type="button" className="secondary" onClick={() => copy(info.apiKey)}>Copy</button>
              <button type="button" className="danger" onClick={regenerate}>Regenerate</button>
            </div>
          </div>
        )}
        <div className="field">
          <label>Base URL</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input value={base} readOnly style={{ flex: 1 }} />
            <button type="button" className="secondary" onClick={() => copy(base)}>Copy</button>
            <a className="secondary" href={`${base}/integrations/openapi.json`} target="_blank" rel="noreferrer" style={{ alignSelf: 'center' }}>OpenAPI spec</a>
          </div>
          <span className="hint" style={{ fontSize: '0.78rem' }}>Import the OpenAPI spec into Postman, Zapier, Make or n8n to get every endpoint ready to use.</span>
        </div>
      </div>

      <div className="card">
        <h3 className="form-section-title" style={{ marginTop: 0 }}><span>Endpoints</span></h3>
        <div className="table-scroll">
          <table className="pro-table">
            <thead><tr><th>Method</th><th>Path</th><th>What it does</th></tr></thead>
            <tbody>
              {ENDPOINTS.map(([method, path, what]) => (
                <tr key={`${method} ${path}`}>
                  <td><span className="badge pending">{method}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{path}</td>
                  <td className="secondary-cell">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="form-section-title" style={{ marginTop: 0 }}><span>Examples</span></h3>
        <div className="field">
          <label>Create a lead</label>
          <textarea readOnly rows={5} value={createCurl} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
        </div>
        <div className="field">
          <label>Read leads changed since a time (incremental sync)</label>
          <textarea readOnly rows={2} value={listCurl} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
        </div>
        <div className="field">
          <label>Get notified of lead events (your system receives a POST with the lead as JSON)</label>
          <textarea readOnly rows={4} value={subscribeCurl} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
        </div>
        <p className="hint">
          Subscriptions appear on the Push tab, where you can add authentication or a custom body. If the other system
          sends leads in its own format instead of this one, use the Receive tab.
        </p>
      </div>
    </div>
  );
}
