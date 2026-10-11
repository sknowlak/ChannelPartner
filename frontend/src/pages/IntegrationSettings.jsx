import { useEffect, useMemo, useState } from 'react';
import {
  createWebhook, deleteWebhook, getMyProfile, listDeliveries, listLeadFields, listWebhooks,
  resyncWebhook, retryDelivery, testWebhook, updateWebhook
} from '../api/client';
import { PERMISSIONS } from '../utils/permissions';
import SettingsCategories from '../components/SettingsCategories';
import IntegrationTabs from '../components/IntegrationTabs';
import AuthEditor from '../components/AuthEditor';
import DeliveryDetailModal from '../components/DeliveryDetailModal';
import FieldMappingTable from '../components/FieldMappingTable';
import { formatDateTime } from '../utils/timezone';
import { buildPreviewBody } from '../utils/webhookPreview';
import { bodyFromRows, parseCurl, parseTemplateObject, suggestRows } from '../utils/curlMapping';

const EVENT_OPTIONS = [
  { key: 'LEAD_CREATED', label: 'Lead Created' },
  { key: 'LEAD_UPDATED', label: 'Lead Updated' },
  { key: 'STAGE_UPDATED', label: 'Stage Updated' },
  { key: 'BOOKING_COMPLETED', label: 'Booking Completed' }
];
const FORMATS = ['JSON', 'FORM', 'CUSTOM'];
const METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];
const UPDATE_METHODS = ['PUT', 'PATCH', 'POST', 'DELETE'];
const CURL_PLACEHOLDER = [
  "curl --location 'https://client-crm.example.com/api/leads' \\",
  "--header 'API-Key: ...' \\",
  "--header 'Content-Type: application/json' \\",
  `--data-raw '{"Name": "...", "Mobile": "..."}'`
].join('\n');
const initialForm = {
  name: '', targetUrl: '', method: 'POST', format: 'JSON', headersText: '{}', bodyTemplate: '', events: ['LEAD_CREATED'],
  auth: { type: 'NONE' }, mode: 'SAME', responseIdPath: '', updateUrl: '', updateMethod: 'PUT', updateBodyTemplate: '', maxRetries: 3
};
const AUTH_LABELS = { NONE: '', API_KEY: 'API key', BEARER: 'Bearer', BASIC: 'Basic auth', OAUTH2: 'OAuth 2.0', HMAC: 'HMAC signed' };

const SYSTEM_PLACEHOLDERS = [
  { path: 'registrationId', label: 'Registration ID' },
  { path: 'external.id', label: "Their record ID (create + update mode)" },
  { path: 'stage', label: 'Stage' },
  { path: 'isBooked', label: 'Is Booked' },
  { path: 'customer.countryCode', label: 'Country Dial Code' },
  { path: 'customer.nationalNumber', label: 'Mobile (without code)' }
];

// The channel partner sending the lead - for client CRMs that record which
// partner a lead came from (e.g. Leadrat's ChannelPartnerName/Mobile/Email).
const PARTNER_PLACEHOLDERS = [
  { path: 'partner.name', label: 'Partner Name' },
  { path: 'partner.mobile', label: 'Partner Mobile' },
  { path: 'partner.email', label: 'Partner Email' },
  { path: 'partner.companyName', label: 'Partner Company' }
];

// Placeholder paths mirror how updateMyRegistration/buildLeadPayload read a
// field by its scope - built from the partner's ACTUAL enabled lead fields
// (not a hardcoded guess) so the list is always correct for what they've
// configured in Settings > Lead, including any custom fields they've added.
function placeholderPathFor(def) {
  if (def.scope === 'customer') return `customer.${def.fieldKey}`;
  if (def.scope === 'custom') return `customFields.${def.fieldKey}`;
  return def.fieldKey;
}

export default function IntegrationSettings() {
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState(null);

  const [webhooks, setWebhooks] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [fieldDefs, setFieldDefs] = useState([]);
  const [showCurlImport, setShowCurlImport] = useState(false);
  const [curlText, setCurlText] = useState('');
  const [curlError, setCurlError] = useState(null);

  const [deliveries, setDeliveries] = useState(null);
  const [deliveryFilters, setDeliveryFilters] = useState({ webhookId: '', status: '', from: '', to: '' });
  const [resyncTarget, setResyncTarget] = useState(null);
  const [resyncRange, setResyncRangeState] = useState({ from: '', to: '' });
  const [viewingDelivery, setViewingDelivery] = useState(null);

  const canManageSettings = permissions.includes(PERMISSIONS.MANAGE_SETTINGS);

  const load = () => {
    Promise.all([getMyProfile(), listWebhooks(), listLeadFields()])
      .then(([{ data: me }, { data: webhookData }, { data: fieldData }]) => {
        setPermissions(me.permissions || []);
        setWebhooks(webhookData.webhooks);
        setFieldDefs(fieldData.definitions.filter((d) => d.isEnabled));
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  // Grouped the same way the Add/Edit Lead form groups its tabs, plus a
  // leading "Lead" group for fields that aren't part of the configurable
  // catalogue at all (registrationId, stage, isBooked).
  const placeholderGroups = useMemo(() => {
    const groups = [{ label: 'Lead', items: SYSTEM_PLACEHOLDERS }, { label: 'Channel Partner', items: PARTNER_PLACEHOLDERS }];
    const byGroup = new Map();
    for (const def of fieldDefs) {
      const items = byGroup.get(def.group) || [];
      items.push({ path: placeholderPathFor(def), label: def.label });
      byGroup.set(def.group, items);
    }
    for (const [label, items] of byGroup) groups.push({ label, items });
    return groups;
  }, [fieldDefs]);

  const loadDeliveries = () => {
    const params = {};
    if (deliveryFilters.webhookId) params.webhookId = deliveryFilters.webhookId;
    if (deliveryFilters.status) params.status = deliveryFilters.status;
    if (deliveryFilters.from) params.from = deliveryFilters.from;
    if (deliveryFilters.to) params.to = deliveryFilters.to;
    listDeliveries(params)
      .then(({ data }) => setDeliveries(data))
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  useEffect(load, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadDeliveries, [deliveryFilters]);

  const startCreate = ({ fromCurl = false } = {}) => {
    setEditingId(null);
    setForm(initialForm);
    setShowCurlImport(fromCurl);
    setCurlText('');
    setCurlError(null);
    setShowForm(true);
  };

  // "Paste the client CRM's cURL" (section 47) - URL, method and headers are
  // taken as-is; a JSON body becomes a Custom template with each key
  // auto-mapped to the closest CRM field, ready to review in the mapping table.
  const importCurl = () => {
    setCurlError(null);
    try {
      const parsed = parseCurl(curlText);
      const bodyObject = parseTemplateObject(parsed.body);
      const fieldOptions = placeholderGroups.flatMap((g) => g.items);
      const bodyTemplate = bodyObject
        ? JSON.stringify(bodyFromRows(bodyObject, suggestRows(bodyObject, fieldOptions)), null, 4)
        : parsed.body;
      setForm((f) => ({
        ...f,
        name: f.name || parsed.name,
        targetUrl: parsed.url,
        method: parsed.method,
        format: 'CUSTOM',
        headersText: JSON.stringify(parsed.headers, null, 2),
        bodyTemplate
      }));
      setShowCurlImport(false);
    } catch (err) {
      setCurlError(err.message);
    }
  };

  const startEdit = (wh) => {
    setEditingId(wh.webhookId);
    setShowCurlImport(false);
    setForm({
      ...initialForm,
      name: wh.name, targetUrl: wh.targetUrl, method: wh.method, format: wh.format,
      headersText: JSON.stringify(wh.headers || {}, null, 2), bodyTemplate: wh.bodyTemplate || '', events: wh.events,
      auth: wh.auth || { type: 'NONE' }, mode: wh.mode || 'SAME', responseIdPath: wh.responseIdPath || '',
      updateUrl: wh.updateUrl || '', updateMethod: wh.updateMethod || 'PUT', updateBodyTemplate: wh.updateBodyTemplate || '',
      maxRetries: wh.maxRetries ?? 3
    });
    setShowForm(true);
  };

  const toggleEvent = (key) => setForm((f) => ({
    ...f,
    events: f.events.includes(key) ? f.events.filter((e) => e !== key) : [...f.events, key]
  }));

  const insertPlaceholder = (path) => setForm((f) => ({
    ...f,
    bodyTemplate: `${f.bodyTemplate}${f.bodyTemplate && !f.bodyTemplate.endsWith(' ') ? ' ' : ''}{{${path}}}`
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let headers;
      try {
        headers = JSON.parse(form.headersText || '{}');
      } catch {
        throw new Error('Headers must be valid JSON, e.g. {"Authorization": "Bearer xyz"}');
      }
      const payload = {
        name: form.name, targetUrl: form.targetUrl, method: form.method, format: form.format,
        headers, bodyTemplate: form.bodyTemplate, events: form.events,
        auth: form.auth, mode: form.mode, responseIdPath: form.responseIdPath, updateUrl: form.updateUrl,
        updateMethod: form.updateMethod, updateBodyTemplate: form.updateBodyTemplate, maxRetries: Number(form.maxRetries)
      };
      if (editingId) await updateWebhook(editingId, payload);
      else await createWebhook(payload);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (wh) => {
    try {
      await updateWebhook(wh.webhookId, { isEnabled: !wh.isEnabled });
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const remove = async (wh) => {
    if (!window.confirm(`Delete webhook "${wh.name}"? This cannot be undone.`)) return;
    try {
      await deleteWebhook(wh.webhookId);
      load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  // Pushes the newest lead through this webhook right now and reports back.
  const handleTest = async (wh) => {
    try {
      const { data } = await testWebhook(wh.webhookId);
      const idNote = data.externalId ? `\nTheir record ID: ${data.externalId}` : '';
      window.alert(`${data.status === 'SUCCESS' ? 'Success' : 'Failed'} - lead ${data.registrationId}, HTTP ${data.httpStatus ?? '-'}${data.errorMessage ? `\n${data.errorMessage}` : ''}${idNote}`);
      loadDeliveries();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const handleRetry = async (deliveryId) => {
    try {
      await retryDelivery(deliveryId);
      loadDeliveries();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const handleResync = async () => {
    try {
      const { data } = await resyncWebhook(resyncTarget.webhookId, resyncRange);
      window.alert(data.truncated
        ? `Resync pushed the first ${data.total} of ${data.matching} lead(s) (limit ${data.limit} per run). Narrow the date range to push the rest.`
        : `Resync complete: ${data.total} lead(s) pushed.`);
      setResyncTarget(null);
      loadDeliveries();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  return (
    <div className="page page-wide">
      <div>
        <h1 style={{ marginBottom: '0.2rem' }}>Settings</h1>
        <p className="hint" style={{ margin: 0 }}>
          Connect any system: push leads out, receive or pull them in, and let other systems use your API.
        </p>
      </div>

      <SettingsCategories />
      <IntegrationTabs />

      {error && <div className="error-box">{error}</div>}

      {/* --- Outbound Webhooks --- */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="form-section-title" style={{ marginTop: 0 }}><span>Outbound Webhooks - Push Leads &amp; Updates</span></h3>
          {canManageSettings && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {!showForm && <button className="secondary" onClick={() => startCreate({ fromCurl: true })}>Import from cURL</button>}
              <button className="pill-primary" onClick={showForm ? () => setShowForm(false) : () => startCreate()}>
                {showForm ? 'Cancel' : '+ Add Webhook'}
              </button>
            </div>
          )}
        </div>
        <p className="hint">
          Fully customisable per webhook: JSON, Form (x-www-form-urlencoded), or your own Custom body template with{' '}
          <code>{'{{fieldKey}}'}</code> placeholders (e.g. <code>{'{{customer.name}}'}</code>) - works like filling in a cURL command once.
        </p>

        {showForm && canManageSettings && (
          <form className="card" onSubmit={handleSubmit} style={{ background: '#f8f9fb' }}>
            {showCurlImport ? (
              <div className="field">
                <label>Paste your client CRM's cURL</label>
                <p className="hint" style={{ marginTop: 0 }}>
                  Paste the example request their API docs or Postman gives you (with real or sample data). The URL, method and
                  headers are copied as-is, and every key in the body is listed below so you can choose which CRM field fills it for each lead.
                </p>
                <textarea
                  rows={8}
                  value={curlText}
                  onChange={(e) => setCurlText(e.target.value)}
                  placeholder={CURL_PLACEHOLDER}
                  style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
                {curlError && <div className="error-box" style={{ marginTop: '0.5rem' }}>{curlError}</div>}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button type="button" className="primary" onClick={importCurl} disabled={!curlText.trim()}>Parse &amp; Map Fields</button>
                  <button type="button" className="secondary" onClick={() => setShowCurlImport(false)}>Set up manually instead</button>
                </div>
              </div>
            ) : (
              <p className="hint" style={{ marginTop: 0 }}>
                Have the client's cURL? <button type="button" className="link-button" onClick={() => setShowCurlImport(true)}>Import from cURL</button> to fill this in and map fields automatically.
              </p>
            )}

            <div className="form-grid">
              <div className="field">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="field">
                <label>Target URL</label>
                <input type="url" value={form.targetUrl} onChange={(e) => setForm((f) => ({ ...f, targetUrl: e.target.value }))} required placeholder="https://your-system.example.com/webhook" />
              </div>
              <div className="field">
                <label>HTTP Method</label>
                <select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Format</label>
                <select value={form.format} onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}>
                  {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            <p className="hint" style={{ marginTop: 0 }}>
              The URL can contain variables too, e.g. <code>{'https://crm.example.com/leads/{{external.id}}'}</code>.
            </p>

            <div className="field">
              <label>Headers (JSON object)</label>
              <textarea rows={3} value={form.headersText} onChange={(e) => setForm((f) => ({ ...f, headersText: e.target.value }))} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
            </div>

            <AuthEditor value={form.auth} onChange={(auth) => setForm((f) => ({ ...f, auth }))} title="Authentication (how Leadrat signs in to their API)" />

            <div className="card" style={{ background: '#fff', padding: '0.9rem 1rem' }}>
              <h4 style={{ margin: '0 0 0.4rem' }}>New leads vs. updates</h4>
              <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontWeight: 400 }}>
                <input type="radio" checked={form.mode === 'SAME'} onChange={() => setForm((f) => ({ ...f, mode: 'SAME' }))} />
                Send every event to the same URL
              </label>
              <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontWeight: 400 }}>
                <input type="radio" checked={form.mode === 'CREATE_UPDATE'} onChange={() => setForm((f) => ({ ...f, mode: 'CREATE_UPDATE' }))} />
                Create the record once, then update that same record (no duplicates on their side)
              </label>
              <div className="form-grid" style={{ marginTop: '0.6rem' }}>
                <div className="field">
                  <label>Their record ID in the response {form.mode === 'CREATE_UPDATE' ? '*' : '(optional)'}</label>
                  <input value={form.responseIdPath} onChange={(e) => setForm((f) => ({ ...f, responseIdPath: e.target.value }))} placeholder="e.g. id, data.id, result.leadId" />
                  <span className="hint" style={{ fontSize: '0.78rem' }}>Where the ID is in their JSON reply to the create request. Saved per lead as <code>{'{{external.id}}'}</code>.</span>
                </div>
                <div className="field">
                  <label>Automatic retries</label>
                  <select value={form.maxRetries} onChange={(e) => setForm((f) => ({ ...f, maxRetries: e.target.value }))}>
                    {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 0 ? 'Off' : `${n} ${n === 1 ? 'retry' : 'retries'}`}</option>)}
                  </select>
                  <span className="hint" style={{ fontSize: '0.78rem' }}>For timeouts, HTTP 429 and 5xx errors - after 1 min, 5 min, 30 min, 2 h, 6 h.</span>
                </div>
              </div>
              {form.mode === 'CREATE_UPDATE' && (
                <div className="form-grid">
                  <div className="field">
                    <label>Update URL *</label>
                    <input value={form.updateUrl} onChange={(e) => setForm((f) => ({ ...f, updateUrl: e.target.value }))} placeholder="https://crm.example.com/leads/{{external.id}}" />
                  </div>
                  <div className="field">
                    <label>Update method</label>
                    <select value={form.updateMethod} onChange={(e) => setForm((f) => ({ ...f, updateMethod: e.target.value }))}>
                      {UPDATE_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  {form.format === 'CUSTOM' && (
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label>Update body (blank = same as create)</label>
                      <textarea rows={4} value={form.updateBodyTemplate} onChange={(e) => setForm((f) => ({ ...f, updateBodyTemplate: e.target.value }))} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="info-box">
              <strong>How values get filled in:</strong> this webhook is reused for every lead - Leadrat doesn't send a static
              example, it sends a fresh push each time a selected event happens, with THAT lead's current values.
              <ul>
                <li><strong>JSON / Form</strong> automatically include every field on the lead - nothing to set up.</li>
                <li><strong>Custom</strong> - write your own request body and drop in <code>{'{{placeholders}}'}</code> anywhere;
                  each one is swapped for that lead's real value right before sending. Click a variable below to insert it.</li>
              </ul>
            </div>

            {form.format === 'CUSTOM' && (
              <>
                {parseTemplateObject(form.bodyTemplate) && (
                  <FieldMappingTable
                    template={form.bodyTemplate}
                    groups={placeholderGroups}
                    onChange={(bodyTemplate) => setForm((f) => ({ ...f, bodyTemplate }))}
                  />
                )}
                <details className="field" open={!parseTemplateObject(form.bodyTemplate)}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#444' }}>Body Template (raw) - edit directly or insert variables</summary>
                  <textarea
                    rows={8}
                    value={form.bodyTemplate}
                    onChange={(e) => setForm((f) => ({ ...f, bodyTemplate: e.target.value }))}
                    placeholder='{"lead_id":"{{registrationId}}","name":"{{customer.name}}","mobile":"{{customer.mobile}}"}'
                    style={{ fontFamily: 'monospace', fontSize: '0.85rem', marginTop: '0.5rem' }}
                  />

                  {placeholderGroups.map((group) => (
                    <div key={group.label}>
                      <div className="placeholder-group-label">{group.label}</div>
                      <div className="placeholder-chips">
                        {group.items.map((item) => (
                          <button type="button" key={item.path} className="placeholder-chip" onClick={() => insertPlaceholder(item.path)} title={item.label}>
                            {'{{'}{item.path}{'}}'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </details>
              </>
            )}

            <div className="field">
              <label>Preview - what will actually be sent (sample lead)</label>
              <textarea readOnly rows={6} value={buildPreviewBody(form.format, form.bodyTemplate, form.headersText)} style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: '#f3f4f7' }} />
            </div>

            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#444' }}>Send on</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', margin: '0.5rem 0 1rem' }}>
              {EVENT_OPTIONS.map((ev) => (
                <label key={ev.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 400 }}>
                  <input type="checkbox" checked={form.events.includes(ev.key)} onChange={() => toggleEvent(ev.key)} />
                  {ev.label}
                </label>
              ))}
            </div>

            <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving...' : editingId ? 'Save Changes' : 'Create Webhook'}</button>
          </form>
        )}

        <table className="pro-table">
          <thead>
            <tr><th>Name</th><th>Target</th><th>Format</th><th>Events</th><th>Enabled</th>{canManageSettings && <th>Actions</th>}</tr>
          </thead>
          <tbody>
            {webhooks && webhooks.map((wh) => (
              <tr key={wh.webhookId}>
                <td className="primary-cell">{wh.name}</td>
                <td className="secondary-cell">
                  {wh.method} {wh.targetUrl}
                  {(AUTH_LABELS[wh.auth?.type] || wh.mode === 'CREATE_UPDATE' || wh.createdVia === 'API') && (
                    <div style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                      {[AUTH_LABELS[wh.auth?.type], wh.mode === 'CREATE_UPDATE' && 'create + update', wh.createdVia === 'API' && 'subscribed via API'].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </td>
                <td>{wh.format}</td>
                <td className="secondary-cell">{wh.events.join(', ')}</td>
                <td>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={wh.isEnabled} disabled={!canManageSettings} onChange={() => toggleEnabled(wh)} />
                    <span className="slider" />
                  </label>
                </td>
                {canManageSettings && (
                  <td>
                    <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => startEdit(wh)}>Edit</button>
                    <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => handleTest(wh)}>Test</button>
                    <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => { setResyncTarget(wh); setResyncRangeState({ from: '', to: '' }); }}>Sync</button>
                    <button className="danger" onClick={() => remove(wh)}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
            {webhooks && webhooks.length === 0 && <tr><td colSpan={canManageSettings ? 6 : 5} className="hint">No webhooks configured yet.</td></tr>}
          </tbody>
        </table>
        {!webhooks && !error && <p className="hint">Loading...</p>}

        {resyncTarget && (
          <div className="card" style={{ background: '#f8f9fb', marginTop: '1rem' }}>
            <h4 style={{ marginTop: 0 }}>Sync leads to "{resyncTarget.name}"</h4>
            <p className="hint">Push every lead registered in this date range again (leave both blank to push everything).</p>
            <div className="form-grid">
              <div className="field">
                <label>From</label>
                <input type="date" value={resyncRange.from} onChange={(e) => setResyncRangeState((r) => ({ ...r, from: e.target.value }))} />
              </div>
              <div className="field">
                <label>To</label>
                <input type="date" value={resyncRange.to} onChange={(e) => setResyncRangeState((r) => ({ ...r, to: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="secondary" onClick={() => setResyncTarget(null)}>Cancel</button>
              <button className="primary" onClick={handleResync}>Push Leads in Range</button>
            </div>
          </div>
        )}
      </div>

      {/* --- Delivery Log --- */}
      <div className="card">
        <h3 className="form-section-title" style={{ marginTop: 0 }}><span>Delivery Log</span></h3>
        <p className="hint">Every push attempt - pass, fail, and why - so a failed delivery is never silent.</p>

        <div className="toolbar">
          <div className="toolbar-left">
            <select value={deliveryFilters.webhookId} onChange={(e) => setDeliveryFilters((f) => ({ ...f, webhookId: e.target.value }))}>
              <option value="">All webhooks</option>
              {(webhooks || []).map((wh) => <option key={wh.webhookId} value={wh.webhookId}>{wh.name}</option>)}
            </select>
            <select value={deliveryFilters.status} onChange={(e) => setDeliveryFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All statuses</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
          <div className="toolbar-right">
            <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              From
              <input type="date" value={deliveryFilters.from} onChange={(e) => setDeliveryFilters((f) => ({ ...f, from: e.target.value }))} />
            </label>
            <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              To
              <input type="date" value={deliveryFilters.to} onChange={(e) => setDeliveryFilters((f) => ({ ...f, to: e.target.value }))} />
            </label>
          </div>
        </div>

        {deliveries && (
          <p className="hint">
            {deliveries.total} total · {deliveries.success} succeeded · {deliveries.failed} failed
          </p>
        )}

        <div className="table-scroll">
          <table className="pro-table">
            <thead>
              <tr><th>Date &amp; Time</th><th>Webhook</th><th>Event</th><th>Lead</th><th>Status</th><th>HTTP</th><th>Error</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {deliveries && deliveries.deliveries.map((d) => {
                const wh = (webhooks || []).find((w) => w.webhookId === d.webhookId);
                return (
                  <tr key={d.deliveryId}>
                    <td className="secondary-cell">{formatDateTime(d.createdAt)}</td>
                    <td>{wh ? wh.name : d.webhookId}</td>
                    <td>{d.eventType}{d.operation && d.operation !== 'SEND' ? ` (${d.operation.toLowerCase()})` : ''}</td>
                    <td className="secondary-cell">{d.registrationId}</td>
                    <td><span className={`badge ${d.status === 'SUCCESS' ? 'accepted' : 'rejected'}`}>{d.status === 'SUCCESS' ? 'Pass' : 'Fail'}</span></td>
                    <td>{d.httpStatus || '-'}</td>
                    <td className="secondary-cell" title={d.errorMessage}>
                      {d.errorMessage ? d.errorMessage.slice(0, 40) : '-'}
                      {d.nextRetryAt && <div style={{ fontSize: '0.75rem' }}>Retrying {formatDateTime(d.nextRetryAt)}</div>}
                    </td>
                    <td>
                      <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => setViewingDelivery(d)}>View</button>
                      {canManageSettings && d.status === 'FAILED' && (
                        <button className="secondary" onClick={() => handleRetry(d.deliveryId)}>Retry</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {deliveries && deliveries.deliveries.length === 0 && (
                <tr><td colSpan={8} className="hint">No deliveries match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!deliveries && !error && <p className="hint">Loading...</p>}
      </div>

      {viewingDelivery && <DeliveryDetailModal delivery={viewingDelivery} onClose={() => setViewingDelivery(null)} />}
    </div>
  );
}
