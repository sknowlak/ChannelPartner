import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { getIntegrationApiKey, getMyProfile, listLeadFields, regenerateIntegrationApiKey } from '../api/client';
import SettingsCategories from '../components/SettingsCategories';
import IntegrationTabs from '../components/IntegrationTabs';
import { PERMISSIONS } from '../utils/permissions';
import { formatDate } from '../utils/timezone';

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

// [method, path, description key under integrations:api.endpoints]
const ENDPOINTS = [
  ['POST', '/integrations/leads', 'createLead'],
  ['GET', '/integrations/leads?updatedSince=2026-01-01T00:00:00Z&page=1&limit=50', 'listLeads'],
  ['GET', '/integrations/leads?externalReferenceId=YOUR-ID-123', 'findLead'],
  ['GET', '/integrations/leads/:registrationId', 'getLead'],
  ['PATCH', '/integrations/leads/:registrationId', 'updateLead'],
  ['POST', '/integrations/leads/:registrationId/progress', 'progress'],
  ['POST', '/integrations/leads/:registrationId/booking', 'booking'],
  ['GET', '/integrations/lead-statuses', 'statuses'],
  ['GET', '/integrations/lead-fields', 'fields'],
  ['POST', '/integrations/subscriptions', 'subscribe'],
  ['GET', '/integrations/subscriptions', 'listSubscriptions'],
  ['DELETE', '/integrations/subscriptions/:subscriptionId', 'unsubscribe']
];
// Elements for react-i18next <Trans>; code snippets carry their own literal text.
const KEY_FORMS = {
  hdr: <code>{'X-Api-Key'}</code>,
  bearer: <code>{'Authorization: Bearer <key>'}</code>,
  query: <code>{'?api_key=<key>'}</code>
};
const SUBSCRIBE_EXAMPLE = '{"targetUrl": "...", "events": ["LEAD_CREATED", "STAGE_UPDATED"]}';

export default function IntegrationApi() {
  const { t } = useTranslation(['integrations', 'common']);
  const [permissions, setPermissions] = useState(null);
  const [info, setInfo] = useState(null);
  // The full key exists only in this response (section 52) - it is never
  // retrievable again, so it lives in memory until the page is left.
  const [newKey, setNewKey] = useState('');
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
  const shownKey = newKey || 'YOUR_API_KEY';
  const example = useMemo(() => buildExamplePayload(fieldDefs), [fieldDefs]);
  const copy = (text) => navigator.clipboard?.writeText(text).catch(() => {});

  const regenerate = async () => {
    const warning = info?.hasKey ? t('api.regenerateConfirm') : t('api.generateConfirm');
    if (!window.confirm(warning)) return;
    try {
      const { data } = await regenerateIntegrationApiKey();
      setNewKey(data.apiKey);
      setInfo((i) => ({ ...i, hasKey: true, apiKeyPrefix: data.apiKeyPrefix, apiKeyCreatedAt: data.apiKeyCreatedAt }));
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
        <h1 style={{ marginBottom: '0.2rem' }}>{t('page.title')}</h1>
        <p className="hint" style={{ margin: 0 }}>{t('page.subtitle')}</p>
      </div>
      <SettingsCategories />
      <IntegrationTabs />
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h3 className="form-section-title" style={{ marginTop: 0 }}><span>{t('api.title')}</span></h3>
        <p className="hint">
          <Trans t={t} i18nKey="api.intro" values={{ limit: 600 }} components={KEY_FORMS} />
        </p>
        {permissions && !canManage && <p className="hint">{t('api.noPermission')}</p>}
        {info && (
          <div className="field">
            <label>{t('api.key')}</label>
            {newKey ? (
              <>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input value={newKey} readOnly style={{ flex: 1, fontFamily: 'monospace' }} />
                  <button type="button" className="secondary" onClick={() => copy(newKey)}>{t('common:actions.copy')}</button>
                </div>
                <div className="info-box" style={{ marginTop: '0.5rem' }}>
                  {t('api.shownOnce')}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input readOnly style={{ flex: 1, fontFamily: 'monospace' }}
                  value={info.hasKey
                    ? `${info.apiKeyPrefix}${'•'.repeat(20)}  ${t('api.created', { date: info.apiKeyCreatedAt ? formatDate(info.apiKeyCreatedAt) : '-' })}`
                    : t('api.noKey')} />
                <button type="button" className={info.hasKey ? 'danger' : 'primary'} onClick={regenerate}>{info.hasKey ? t('api.generateNew') : t('api.generate')}</button>
              </div>
            )}
          </div>
        )}
        <div className="field">
          <label>{t('api.baseUrl')}</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input value={base} readOnly style={{ flex: 1 }} />
            <button type="button" className="secondary" onClick={() => copy(base)}>{t('common:actions.copy')}</button>
            <a className="secondary" href={`${base}/integrations/openapi.json`} target="_blank" rel="noreferrer" style={{ alignSelf: 'center' }}>{t('api.openApi')}</a>
          </div>
          <span className="hint" style={{ fontSize: '0.78rem' }}>{t('api.openApiHint')}</span>
        </div>
      </div>

      <div className="card">
        <h3 className="form-section-title" style={{ marginTop: 0 }}><span>{t('api.endpointsTitle')}</span></h3>
        <div className="table-scroll">
          <table className="pro-table">
            <thead><tr><th>{t('api.colMethod')}</th><th>{t('api.colPath')}</th><th>{t('api.colWhat')}</th></tr></thead>
            <tbody>
              {ENDPOINTS.map(([method, path, what]) => (
                <tr key={`${method} ${path}`}>
                  <td><span className="badge pending">{method}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{path}</td>
                  <td className="secondary-cell">{t(`api.endpoints.${what}`, { example: SUBSCRIBE_EXAMPLE })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="form-section-title" style={{ marginTop: 0 }}><span>{t('api.examplesTitle')}</span></h3>
        <div className="field">
          <label>{t('api.exampleCreate')}</label>
          <textarea readOnly rows={5} value={createCurl} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
        </div>
        <div className="field">
          <label>{t('api.exampleList')}</label>
          <textarea readOnly rows={2} value={listCurl} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
        </div>
        <div className="field">
          <label>{t('api.exampleSubscribe')}</label>
          <textarea readOnly rows={4} value={subscribeCurl} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
        </div>
        <p className="hint">{t('api.examplesFooter')}</p>
      </div>
    </div>
  );
}
