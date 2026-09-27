import { useEffect, useMemo, useState } from 'react';
import {
  createWebhook, deleteWebhook, getIntegrationApiKey, getMyProfile, listDeliveries, listLeadFields, listWebhooks,
  regenerateIntegrationApiKey, resyncWebhook, retryDelivery, updateWebhook
} from '../api/client';
import { PERMISSIONS } from '../utils/permissions';
import SettingsCategories from '../components/SettingsCategories';
import DeliveryDetailModal from '../components/DeliveryDetailModal';
import { formatDateTime } from '../utils/timezone';
import { buildPreviewBody } from '../utils/webhookPreview';

const EVENT_OPTIONS = [
  { key: 'LEAD_CREATED', label: 'Lead Created' },
  { key: 'LEAD_UPDATED', label: 'Lead Updated' },
  { key: 'STAGE_UPDATED', label: 'Stage Updated' },
  { key: 'BOOKING_COMPLETED', label: 'Booking Completed' }
];
const FORMATS = ['JSON', 'FORM', 'CUSTOM'];
const METHODS = ['POST', 'PUT', 'PATCH'];
const initialForm = { name: '', targetUrl: '', method: 'POST', format: 'JSON', headersText: '{}', bodyTemplate: '', events: ['LEAD_CREATED'] };

const SYSTEM_PLACEHOLDERS = [
  { path: 'registrationId', label: 'Registration ID' },
  { path: 'stage', label: 'Stage' },
  { path: 'isBooked', label: 'Is Booked' }
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

// The example calls below must actually succeed when copy-pasted, for
// whatever this partner has configured - not just the name/mobile default.
// So the payload is built from their real required-field list (Settings >
// Lead) rather than a hardcoded guess that only matches the out-of-the-box
// config.
function sampleValueFor(def) {
  if (def.fieldKey === 'name') return 'Jane Doe';
  if (def.fieldKey === 'mobile') return '9876543210';
  switch (def.dataType) {
    case 'SELECT':
      return (def.options && def.options[0]) || 'Option';
    case 'NUMBER':
    case 'CURRENCY':
      return 1000;
    case 'DATE':
      return new Date().toISOString().slice(0, 10);
    case 'TEXTAREA':
      return 'Interested in 2BHK';
    default:
      return `Sample ${def.label}`;
  }
}

function buildExamplePayload(fieldDefs) {
  const customer = { name: 'Jane Doe', mobile: '9876543210' };
  const rest = {};
  for (const def of fieldDefs) {
    if (!def.isRequired || def.fieldKey === 'name' || def.fieldKey === 'mobile') continue;
    const value = sampleValueFor(def);
    if (def.scope === 'customer') customer[def.fieldKey] = value;
    else rest[def.fieldKey] = value;
  }
  return { customer, ...rest };
}

export default function IntegrationSettings() {
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState(null);

  const [apiKeyInfo, setApiKeyInfo] = useState(null);
  const [showKey, setShowKey] = useState(false);

  const [webhooks, setWebhooks] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [fieldDefs, setFieldDefs] = useState([]);

  const [deliveries, setDeliveries] = useState(null);
  const [deliveryFilters, setDeliveryFilters] = useState({ webhookId: '', status: '', from: '', to: '' });
  const [resyncTarget, setResyncTarget] = useState(null);
  const [resyncRange, setResyncRangeState] = useState({ from: '', to: '' });
  const [viewingDelivery, setViewingDelivery] = useState(null);

  const canManageSettings = permissions.includes(PERMISSIONS.MANAGE_SETTINGS);

  const load = () => {
    Promise.all([getMyProfile(), getIntegrationApiKey(), listWebhooks(), listLeadFields()])
      .then(([{ data: me }, { data: keyData }, { data: webhookData }, { data: fieldData }]) => {
        setPermissions(me.permissions || []);
        setApiKeyInfo(keyData);
        setWebhooks(webhookData.webhooks);
        setFieldDefs(fieldData.definitions.filter((d) => d.isEnabled));
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  };

  // Grouped the same way the Add/Edit Lead form groups its tabs, plus a
  // leading "Lead" group for fields that aren't part of the configurable
  // catalogue at all (registrationId, stage, isBooked).
  const placeholderGroups = useMemo(() => {
    const groups = [{ label: 'Lead', items: SYSTEM_PLACEHOLDERS }];
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

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const regenerateKey = async () => {
    if (!window.confirm('Regenerate the API key? Anything using the old key will stop working immediately.')) return;
    try {
      const { data } = await regenerateIntegrationApiKey();
      setApiKeyInfo((k) => ({ ...k, apiKey: data.apiKey }));
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(initialForm);
    setShowForm(true);
  };

  const startEdit = (wh) => {
    setEditingId(wh.webhookId);
    setForm({
      name: wh.name, targetUrl: wh.targetUrl, method: wh.method, format: wh.format,
      headersText: JSON.stringify(wh.headers || {}, null, 2), bodyTemplate: wh.bodyTemplate || '', events: wh.events
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
        headers, bodyTemplate: form.bodyTemplate, events: form.events
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
      window.alert(`Resync complete: ${data.total} lead(s) pushed.`);
      setResyncTarget(null);
      loadDeliveries();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  const inboundUrl = apiKeyInfo?.inboundLeadUrl || '';
  const maskedKey = apiKeyInfo ? (showKey ? apiKeyInfo.apiKey : `${apiKeyInfo.apiKey.slice(0, 7)}${'•'.repeat(20)}`) : '';
  // The example commands are copy-pasted as-is, so they must show whatever
  // the key field above is currently showing - never the raw key underneath
  // a "Hide"d mask.
  const exampleKey = apiKeyInfo ? (showKey ? apiKeyInfo.apiKey : maskedKey) : 'YOUR_API_KEY';

  const examplePayload = useMemo(() => buildExamplePayload(fieldDefs), [fieldDefs]);

  const curlExample = `curl -X POST ${inboundUrl} \\\n  -H "X-Api-Key: ${exampleKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(examplePayload)}'`;
  const formExample = (() => {
    const parts = [];
    for (const [k, v] of Object.entries(examplePayload.customer)) parts.push(`customer[${k}]=${encodeURIComponent(v)}`);
    for (const [k, v] of Object.entries(examplePayload)) {
      if (k === 'customer') continue;
      parts.push(`${k}=${encodeURIComponent(v)}`);
    }
    return `curl -X POST ${inboundUrl} \\\n  -H "X-Api-Key: ${exampleKey}" \\\n  -d "${parts.join('&')}"`;
  })();

  return (
    <div className="page page-wide">
      <div>
        <h1 style={{ marginBottom: '0.2rem' }}>Settings</h1>
        <p className="hint" style={{ margin: 0 }}>
          Push leads and lead-progress updates to your own systems, or let your own systems push leads into Leadrat.
        </p>
      </div>

      <SettingsCategories />

      {error && <div className="error-box">{error}</div>}

      {/* --- Inbound --- */}
      <div className="card">
        <h3 className="form-section-title" style={{ marginTop: 0 }}><span>Inbound - Receive Leads</span></h3>
        <p className="hint">Give this URL and API key to your own CRM/website to push leads (and progress updates) into Leadrat.</p>
        {apiKeyInfo && (
          <>
            <div className="field">
              <label>API Key</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input value={maskedKey} readOnly style={{ fontFamily: 'monospace' }} />
                <button type="button" className="secondary" onClick={() => setShowKey((s) => !s)}>{showKey ? 'Hide' : 'Show'}</button>
                <button type="button" className="secondary" onClick={() => copyToClipboard(apiKeyInfo.apiKey)}>Copy</button>
                {canManageSettings && <button type="button" className="danger" onClick={regenerateKey}>Regenerate</button>}
              </div>
            </div>
            <div className="field">
              <label>Inbound Lead URL</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input value={inboundUrl} readOnly />
                <button type="button" className="secondary" onClick={() => copyToClipboard(inboundUrl)}>Copy</button>
              </div>
            </div>
            <div className="field">
              <label>Example - JSON (cURL)</label>
              <textarea readOnly rows={4} value={curlExample} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
            </div>
            <div className="field">
              <label>Example - Form fields</label>
              <textarea readOnly rows={3} value={formExample} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
            </div>
            <p className="hint">
              Progress updates: <code>POST {inboundUrl}/:registrationId/progress</code> with <code>{'{"stage":"Contacted"}'}</code> and the same <code>X-Api-Key</code> header.
            </p>
          </>
        )}
      </div>

      {/* --- Outbound Webhooks --- */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="form-section-title" style={{ marginTop: 0 }}><span>Outbound Webhooks - Push Leads &amp; Updates</span></h3>
          {canManageSettings && (
            <button className="pill-primary" onClick={showForm ? () => setShowForm(false) : startCreate}>
              {showForm ? 'Cancel' : '+ Add Webhook'}
            </button>
          )}
        </div>
        <p className="hint">
          Fully customisable per webhook: JSON, Form (x-www-form-urlencoded), or your own Custom body template with{' '}
          <code>{'{{fieldKey}}'}</code> placeholders (e.g. <code>{'{{customer.name}}'}</code>) - works like filling in a cURL command once.
        </p>

        {showForm && canManageSettings && (
          <form className="card" onSubmit={handleSubmit} style={{ background: '#f8f9fb' }}>
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

            <div className="field">
              <label>Headers (JSON object)</label>
              <textarea rows={3} value={form.headersText} onChange={(e) => setForm((f) => ({ ...f, headersText: e.target.value }))} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
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
              <div className="field">
                <label>Body Template</label>
                <textarea
                  rows={4}
                  value={form.bodyTemplate}
                  onChange={(e) => setForm((f) => ({ ...f, bodyTemplate: e.target.value }))}
                  placeholder='{"lead_id":"{{registrationId}}","name":"{{customer.name}}","mobile":"{{customer.mobile}}"}'
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
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
              </div>
            )}

            <div className="field">
              <label>Preview - what will actually be sent (sample lead)</label>
              <textarea readOnly rows={6} value={buildPreviewBody(form.format, form.bodyTemplate)} style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: '#f3f4f7' }} />
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
                <td className="secondary-cell">{wh.method} {wh.targetUrl}</td>
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
                    <td>{d.eventType}</td>
                    <td className="secondary-cell">{d.registrationId}</td>
                    <td><span className={`badge ${d.status === 'SUCCESS' ? 'accepted' : 'rejected'}`}>{d.status === 'SUCCESS' ? 'Pass' : 'Fail'}</span></td>
                    <td>{d.httpStatus || '-'}</td>
                    <td className="secondary-cell" title={d.errorMessage}>{d.errorMessage ? d.errorMessage.slice(0, 40) : '-'}</td>
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
