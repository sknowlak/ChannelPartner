import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
import { fieldLabel, groupLabel, useDataLabels } from '../i18n/dataLabels';
import { buildPreviewBody } from '../utils/webhookPreview';
import { bodyFromRows, parseCurl, parseTemplateObject, suggestRows } from '../utils/curlMapping';

// Event codes are API values; their labels come from integrations:events.*.
const EVENT_OPTIONS = ['LEAD_CREATED', 'LEAD_UPDATED', 'STAGE_UPDATED', 'BOOKING_COMPLETED'];
const FORMATS = ['JSON', 'FORM', 'CUSTOM'];
const METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];
const UPDATE_METHODS = ['PUT', 'PATCH', 'POST', 'DELETE'];
const CURL_PLACEHOLDER = [
  "curl --location 'https://client-crm.example.com/api/leads' \\",
  "--header 'API-Key: ...' \\",
  "--header 'Content-Type: application/json' \\",
  `--data-raw '{"Name": "...", "Mobile": "..."}'`
].join('\n');
// Elements for react-i18next <Trans>. Code snippets carry their own text so
// {{placeholders}} in them are shown literally, never interpolated.
const RICH_TEXT = {
  strong: <strong />,
  fieldkey: <code>{'{{fieldKey}}'}</code>,
  example: <code>{'{{customer.name}}'}</code>,
  urlexample: <code>{'https://crm.example.com/leads/{{external.id}}'}</code>,
  externalid: <code>{'{{external.id}}'}</code>,
  placeholders: <code>{'{{placeholders}}'}</code>
};
const initialForm = {
  name: '', targetUrl: '', method: 'POST', format: 'JSON', headersText: '{}', bodyTemplate: '', events: ['LEAD_CREATED'],
  auth: { type: 'NONE' }, mode: 'SAME', responseIdPath: '', updateUrl: '', updateMethod: 'PUT', updateBodyTemplate: '', maxRetries: 3
};
// Short auth badges for the webhook list (integrations:authBadge.*); NONE shows nothing.
const AUTH_BADGES = ['API_KEY', 'BEARER', 'BASIC', 'OAUTH2', 'HMAC'];

// `label` stays English on purpose: suggestField() (curlMapping.js) matches
// client keys against it. What is shown comes from `i18nKey`.
const SYSTEM_PLACEHOLDERS = [
  { path: 'registrationId', label: 'Registration ID', i18nKey: 'placeholders.registrationId' },
  { path: 'external.id', label: "Their record ID (create + update mode)", i18nKey: 'placeholders.externalId' },
  { path: 'stage', label: 'Stage', i18nKey: 'placeholders.stage' },
  { path: 'isBooked', label: 'Is Booked', i18nKey: 'placeholders.isBooked' },
  { path: 'customer.countryCode', label: 'Country Dial Code', i18nKey: 'placeholders.countryCode' },
  { path: 'customer.nationalNumber', label: 'Mobile (without code)', i18nKey: 'placeholders.nationalNumber' }
];

// The channel partner sending the lead - for client CRMs that record which
// partner a lead came from (e.g. Leadrat's ChannelPartnerName/Mobile/Email).
const PARTNER_PLACEHOLDERS = [
  { path: 'partner.name', label: 'Partner Name', i18nKey: 'placeholders.partnerName' },
  { path: 'partner.mobile', label: 'Partner Mobile', i18nKey: 'placeholders.partnerMobile' },
  { path: 'partner.email', label: 'Partner Email', i18nKey: 'placeholders.partnerEmail' },
  { path: 'partner.companyName', label: 'Partner Company', i18nKey: 'placeholders.partnerCompany' }
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
  const { t, i18n } = useTranslation(['integrations', 'common']);
  useDataLabels();
  const eventLabel = (code) => t(`events.${code}`, { defaultValue: code });
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
    // `label` is the raw (English/partner) text used for matching and React
    // keys; `display` is what the partner sees in their language.
    const translate = (items) => items.map((item) => ({ ...item, display: t(item.i18nKey) }));
    const groups = [
      { label: 'Lead', display: t('placeholders.groupLead'), items: translate(SYSTEM_PLACEHOLDERS) },
      { label: 'Channel Partner', display: t('placeholders.groupPartner'), items: translate(PARTNER_PLACEHOLDERS) }
    ];
    const byGroup = new Map();
    for (const def of fieldDefs) {
      const items = byGroup.get(def.group) || [];
      items.push({ path: placeholderPathFor(def), label: def.label, display: fieldLabel(def) });
      byGroup.set(def.group, items);
    }
    for (const [label, items] of byGroup) groups.push({ label, display: groupLabel(label), items });
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldDefs, i18n.language]);

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
      setCurlError(err.i18nKey ? t(err.i18nKey, err.i18nParams) : err.message);
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
        throw new Error(t('push.headersInvalid', { example: '{"Authorization": "Bearer xyz"}' }));
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
    if (!window.confirm(t('push.deleteConfirm', { name: wh.name }))) return;
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
      const params = { id: data.registrationId, http: data.httpStatus ?? '-' };
      const lines = [data.status === 'SUCCESS' ? t('push.testSuccess', params) : t('push.testFailed', params)];
      if (data.errorMessage) lines.push(data.errorMessage);
      if (data.externalId) lines.push(t('push.testExternalId', { id: data.externalId }));
      window.alert(lines.join('\n'));
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
        ? t('push.resyncTruncated', { count: data.matching, total: data.total, limit: data.limit })
        : t('push.resyncDone', { count: data.total }));
      setResyncTarget(null);
      loadDeliveries();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  return (
    <div className="page page-wide">
      <div>
        <h1 style={{ marginBottom: '0.2rem' }}>{t('page.title')}</h1>
        <p className="hint" style={{ margin: 0 }}>{t('page.subtitle')}</p>
      </div>

      <SettingsCategories />
      <IntegrationTabs />

      {error && <div className="error-box">{error}</div>}

      {/* --- Outbound Webhooks --- */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="form-section-title" style={{ marginTop: 0 }}><span>{t('push.title')}</span></h3>
          {canManageSettings && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {!showForm && <button className="secondary" onClick={() => startCreate({ fromCurl: true })}>{t('push.importCurl')}</button>}
              <button className="pill-primary" onClick={showForm ? () => setShowForm(false) : () => startCreate()}>
                {showForm ? t('common:actions.cancel') : t('push.add')}
              </button>
            </div>
          )}
        </div>
        <p className="hint">
          <Trans t={t} i18nKey="push.intro" components={RICH_TEXT} />
        </p>

        {showForm && canManageSettings && (
          <form className="card" onSubmit={handleSubmit} style={{ background: '#f8f9fb' }}>
            {showCurlImport ? (
              <div className="field">
                <label>{t('push.curlLabel')}</label>
                <p className="hint" style={{ marginTop: 0 }}>{t('push.curlHelp')}</p>
                <textarea
                  rows={8}
                  value={curlText}
                  onChange={(e) => setCurlText(e.target.value)}
                  placeholder={CURL_PLACEHOLDER}
                  style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
                {curlError && <div className="error-box" style={{ marginTop: '0.5rem' }}>{curlError}</div>}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button type="button" className="primary" onClick={importCurl} disabled={!curlText.trim()}>{t('push.curlParse')}</button>
                  <button type="button" className="secondary" onClick={() => setShowCurlImport(false)}>{t('push.curlManual')}</button>
                </div>
              </div>
            ) : (
              <p className="hint" style={{ marginTop: 0 }}>
                <Trans t={t} i18nKey="push.curlPrompt" components={{ action: <button type="button" className="link-button" onClick={() => setShowCurlImport(true)} /> }} />
              </p>
            )}

            <div className="form-grid">
              <div className="field">
                <label>{t('common:fields.name')}</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="field">
                <label>{t('push.targetUrl')}</label>
                <input type="url" value={form.targetUrl} onChange={(e) => setForm((f) => ({ ...f, targetUrl: e.target.value }))} required placeholder="https://your-system.example.com/webhook" />
              </div>
              <div className="field">
                <label>{t('push.httpMethod')}</label>
                <select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{t('push.format')}</label>
                <select value={form.format} onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}>
                  {FORMATS.map((f) => <option key={f} value={f}>{t(`formats.${f}`)}</option>)}
                </select>
              </div>
            </div>

            <p className="hint" style={{ marginTop: 0 }}>
              <Trans t={t} i18nKey="push.urlVariables" components={RICH_TEXT} />
            </p>

            <div className="field">
              <label>{t('push.headers')}</label>
              <textarea rows={3} value={form.headersText} onChange={(e) => setForm((f) => ({ ...f, headersText: e.target.value }))} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
            </div>

            <AuthEditor value={form.auth} onChange={(auth) => setForm((f) => ({ ...f, auth }))} title={t('push.authTitle')} />

            <div className="card" style={{ background: '#fff', padding: '0.9rem 1rem' }}>
              <h4 style={{ margin: '0 0 0.4rem' }}>{t('push.modeTitle')}</h4>
              <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontWeight: 400 }}>
                <input type="radio" checked={form.mode === 'SAME'} onChange={() => setForm((f) => ({ ...f, mode: 'SAME' }))} />
                {t('push.modeSame')}
              </label>
              <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontWeight: 400 }}>
                <input type="radio" checked={form.mode === 'CREATE_UPDATE'} onChange={() => setForm((f) => ({ ...f, mode: 'CREATE_UPDATE' }))} />
                {t('push.modeCreateUpdate')}
              </label>
              <div className="form-grid" style={{ marginTop: '0.6rem' }}>
                <div className="field">
                  <label>{form.mode === 'CREATE_UPDATE' ? t('push.responseIdRequired') : t('push.responseIdOptional')}</label>
                  <input value={form.responseIdPath} onChange={(e) => setForm((f) => ({ ...f, responseIdPath: e.target.value }))} placeholder={t('push.responseIdPlaceholder')} />
                  <span className="hint" style={{ fontSize: '0.78rem' }}><Trans t={t} i18nKey="push.responseIdHint" components={RICH_TEXT} /></span>
                </div>
                <div className="field">
                  <label>{t('push.retries')}</label>
                  <select value={form.maxRetries} onChange={(e) => setForm((f) => ({ ...f, maxRetries: e.target.value }))}>
                    {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 0 ? t('push.retriesOff') : t('push.retryCount', { count: n })}</option>)}
                  </select>
                  <span className="hint" style={{ fontSize: '0.78rem' }}>{t('push.retriesHint')}</span>
                </div>
              </div>
              {form.mode === 'CREATE_UPDATE' && (
                <div className="form-grid">
                  <div className="field">
                    <label>{t('push.updateUrl')}</label>
                    <input value={form.updateUrl} onChange={(e) => setForm((f) => ({ ...f, updateUrl: e.target.value }))} placeholder="https://crm.example.com/leads/{{external.id}}" />
                  </div>
                  <div className="field">
                    <label>{t('push.updateMethod')}</label>
                    <select value={form.updateMethod} onChange={(e) => setForm((f) => ({ ...f, updateMethod: e.target.value }))}>
                      {UPDATE_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  {form.format === 'CUSTOM' && (
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label>{t('push.updateBody')}</label>
                      <textarea rows={4} value={form.updateBodyTemplate} onChange={(e) => setForm((f) => ({ ...f, updateBodyTemplate: e.target.value }))} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="info-box">
              <Trans t={t} i18nKey="push.howFilled" components={RICH_TEXT} />
              <ul>
                <li><Trans t={t} i18nKey="push.howFilledStandard" components={RICH_TEXT} /></li>
                <li><Trans t={t} i18nKey="push.howFilledCustom" components={RICH_TEXT} /></li>
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
                  <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#444' }}>{t('push.rawTemplate')}</summary>
                  <textarea
                    rows={8}
                    value={form.bodyTemplate}
                    onChange={(e) => setForm((f) => ({ ...f, bodyTemplate: e.target.value }))}
                    placeholder='{"lead_id":"{{registrationId}}","name":"{{customer.name}}","mobile":"{{customer.mobile}}"}'
                    style={{ fontFamily: 'monospace', fontSize: '0.85rem', marginTop: '0.5rem' }}
                  />

                  {placeholderGroups.map((group) => (
                    <div key={group.label}>
                      <div className="placeholder-group-label">{group.display}</div>
                      <div className="placeholder-chips">
                        {group.items.map((item) => (
                          <button type="button" key={item.path} className="placeholder-chip" onClick={() => insertPlaceholder(item.path)} title={item.display}>
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
              <label>{t('push.preview')}</label>
              <textarea readOnly rows={6} value={buildPreviewBody(form.format, form.bodyTemplate, form.headersText, t('push.previewEmpty'))} style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: '#f3f4f7' }} />
            </div>

            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#444' }}>{t('push.sendOn')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', margin: '0.5rem 0 1rem' }}>
              {EVENT_OPTIONS.map((ev) => (
                <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 400 }}>
                  <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)} />
                  {eventLabel(ev)}
                </label>
              ))}
            </div>

            <button className="primary" type="submit" disabled={busy}>{busy ? t('common:actions.saving') : editingId ? t('common:actions.saveChanges') : t('push.create')}</button>
          </form>
        )}

        <table className="pro-table">
          <thead>
            <tr><th>{t('common:fields.name')}</th><th>{t('push.colTarget')}</th><th>{t('push.format')}</th><th>{t('push.colEvents')}</th><th>{t('common:status.enabled')}</th>{canManageSettings && <th>{t('common:fields.actions')}</th>}</tr>
          </thead>
          <tbody>
            {webhooks && webhooks.map((wh) => (
              <tr key={wh.webhookId}>
                <td className="primary-cell">{wh.name}</td>
                <td className="secondary-cell">
                  {wh.method} {wh.targetUrl}
                  {(AUTH_BADGES.includes(wh.auth?.type) || wh.mode === 'CREATE_UPDATE' || wh.createdVia === 'API') && (
                    <div style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                      {[
                        AUTH_BADGES.includes(wh.auth?.type) && t(`authBadge.${wh.auth.type}`),
                        wh.mode === 'CREATE_UPDATE' && t('push.badgeCreateUpdate'),
                        wh.createdVia === 'API' && t('push.badgeViaApi')
                      ].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </td>
                <td>{t(`formats.${wh.format}`, { defaultValue: wh.format })}</td>
                <td className="secondary-cell">{wh.events.map(eventLabel).join(', ')}</td>
                <td>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={wh.isEnabled} disabled={!canManageSettings} onChange={() => toggleEnabled(wh)} />
                    <span className="slider" />
                  </label>
                </td>
                {canManageSettings && (
                  <td>
                    <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => startEdit(wh)}>{t('common:actions.edit')}</button>
                    <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => handleTest(wh)}>{t('common:actions.test')}</button>
                    <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => { setResyncTarget(wh); setResyncRangeState({ from: '', to: '' }); }}>{t('push.sync')}</button>
                    <button className="danger" onClick={() => remove(wh)}>{t('common:actions.delete')}</button>
                  </td>
                )}
              </tr>
            ))}
            {webhooks && webhooks.length === 0 && <tr><td colSpan={canManageSettings ? 6 : 5} className="hint">{t('push.empty')}</td></tr>}
          </tbody>
        </table>
        {!webhooks && !error && <p className="hint">{t('common:states.loading')}</p>}

        {resyncTarget && (
          <div className="card" style={{ background: '#f8f9fb', marginTop: '1rem' }}>
            <h4 style={{ marginTop: 0 }}>{t('push.syncTitle', { name: resyncTarget.name })}</h4>
            <p className="hint">{t('push.syncHelp')}</p>
            <div className="form-grid">
              <div className="field">
                <label>{t('common:fields.from')}</label>
                <input type="date" value={resyncRange.from} onChange={(e) => setResyncRangeState((r) => ({ ...r, from: e.target.value }))} />
              </div>
              <div className="field">
                <label>{t('common:fields.to')}</label>
                <input type="date" value={resyncRange.to} onChange={(e) => setResyncRangeState((r) => ({ ...r, to: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="secondary" onClick={() => setResyncTarget(null)}>{t('common:actions.cancel')}</button>
              <button className="primary" onClick={handleResync}>{t('push.syncSubmit')}</button>
            </div>
          </div>
        )}
      </div>

      {/* --- Delivery Log --- */}
      <div className="card">
        <h3 className="form-section-title" style={{ marginTop: 0 }}><span>{t('deliveries.title')}</span></h3>
        <p className="hint">{t('deliveries.help')}</p>

        <div className="toolbar">
          <div className="toolbar-left">
            <select value={deliveryFilters.webhookId} onChange={(e) => setDeliveryFilters((f) => ({ ...f, webhookId: e.target.value }))}>
              <option value="">{t('deliveries.allWebhooks')}</option>
              {(webhooks || []).map((wh) => <option key={wh.webhookId} value={wh.webhookId}>{wh.name}</option>)}
            </select>
            <select value={deliveryFilters.status} onChange={(e) => setDeliveryFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">{t('deliveries.allStatuses')}</option>
              <option value="SUCCESS">{t('deliveryStatus.SUCCESS')}</option>
              <option value="FAILED">{t('deliveryStatus.FAILED')}</option>
            </select>
          </div>
          <div className="toolbar-right">
            <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {t('common:fields.from')}
              <input type="date" value={deliveryFilters.from} onChange={(e) => setDeliveryFilters((f) => ({ ...f, from: e.target.value }))} />
            </label>
            <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {t('common:fields.to')}
              <input type="date" value={deliveryFilters.to} onChange={(e) => setDeliveryFilters((f) => ({ ...f, to: e.target.value }))} />
            </label>
          </div>
        </div>

        {deliveries && (
          <p className="hint">
            {t('deliveries.summary', { total: deliveries.total, success: deliveries.success, failed: deliveries.failed })}
          </p>
        )}

        <div className="table-scroll">
          <table className="pro-table">
            <thead>
              <tr><th>{t('common:fields.dateTime')}</th><th>{t('deliveries.colWebhook')}</th><th>{t('deliveries.colEvent')}</th><th>{t('deliveries.colLead')}</th><th>{t('common:fields.status')}</th><th>HTTP</th>{/* i18n-ignore: protocol name */}<th>{t('deliveries.colError')}</th><th>{t('common:fields.actions')}</th></tr>
            </thead>
            <tbody>
              {deliveries && deliveries.deliveries.map((d) => {
                const wh = (webhooks || []).find((w) => w.webhookId === d.webhookId);
                return (
                  <tr key={d.deliveryId}>
                    <td className="secondary-cell">{formatDateTime(d.createdAt)}</td>
                    <td>{wh ? wh.name : d.webhookId}</td>
                    <td>{d.operation && d.operation !== 'SEND'
                      ? t('deliveries.eventWithOperation', { event: eventLabel(d.eventType), operation: t(`operations.${d.operation}`, { defaultValue: d.operation.toLowerCase() }) })
                      : eventLabel(d.eventType)}</td>
                    <td className="secondary-cell">{d.registrationId}</td>
                    <td><span className={`badge ${d.status === 'SUCCESS' ? 'accepted' : 'rejected'}`}>{d.status === 'SUCCESS' ? t('delivery.pass') : t('delivery.fail')}</span></td>
                    <td>{d.httpStatus || '-'}</td>
                    <td className="secondary-cell" title={d.errorMessage}>
                      {d.errorMessage ? d.errorMessage.slice(0, 40) : '-'}
                      {d.nextRetryAt && <div style={{ fontSize: '0.75rem' }}>{t('deliveries.retrying', { time: formatDateTime(d.nextRetryAt) })}</div>}
                    </td>
                    <td>
                      <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => setViewingDelivery(d)}>{t('common:actions.view')}</button>
                      {canManageSettings && d.status === 'FAILED' && (
                        <button className="secondary" onClick={() => handleRetry(d.deliveryId)}>{t('common:actions.retry')}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {deliveries && deliveries.deliveries.length === 0 && (
                <tr><td colSpan={8} className="hint">{t('deliveries.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!deliveries && !error && <p className="hint">{t('common:states.loading')}</p>}
      </div>

      {viewingDelivery && <DeliveryDetailModal delivery={viewingDelivery} onClose={() => setViewingDelivery(null)} />}
    </div>
  );
}
