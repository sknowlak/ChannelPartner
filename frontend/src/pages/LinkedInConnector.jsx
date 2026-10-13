import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  connectLinkedIn, createLinkedInConversionRule, disconnectLinkedIn, fetchLinkedInRange, getLinkedInConnector, listLeadStatuses,
  refreshLinkedInAccounts, syncLinkedIn, updateLinkedInConnector
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime } from '../utils/timezone';
import { formatNumber } from '../i18n/format';
import { statusLabel } from '../i18n/dataLabels';
import SettingsCategories from '../components/SettingsCategories';
import LinkedInMark from '../components/LinkedInMark';
import LinkedInPerformance from '../components/LinkedInPerformance';
import LinkedInActivityLog from '../components/LinkedInActivityLog';

// Settings -> Connectors -> LinkedIn (section 59).
const SYNC_CHOICES = [5, 10, 15, 30, 60];
const SOON_MS = 30 * 86400000;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

export default function LinkedInConnector() {
  const { t } = useTranslation(['connectors', 'settings', 'common']);
  const { partner } = useAuth();
  const tz = partner?.timezone;
  const [params, setParams] = useSearchParams();
  const [info, setInfo] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState(null);
  const [rule, setRule] = useState({ stage: '', accountUrn: '', conversionType: 'QUALIFIED_LEAD' });
  const [refreshKey, setRefreshKey] = useState(0);
  const today = ymd(Date.now());
  const [range, setRange] = useState({ from: ymd(Date.now() - 29 * 86400000), to: today });

  const load = useCallback(() => getLinkedInConnector()
    .then(({ data }) => {
      setInfo(data);
      if (data.connection) {
        setForm({ ...data.connection.settings });
        setRule((r) => ({ ...r, accountUrn: r.accountUrn || data.connection.adAccounts.find((a) => a.enabled)?.accountUrn || '' }));
      }
    })
    .catch((err) => setError(err.response?.data?.reason || err.message)), []);

  useEffect(() => {
    load();
    listLeadStatuses().then(({ data }) => setStatuses(data.statuses || [])).catch(() => {});
  }, [load]);

  // Back from LinkedIn's consent screen: show the outcome once, then clean the URL.
  useEffect(() => {
    if (params.get('connected')) {
      setNotice(t('banner.connected'));
      setParams({}, { replace: true });
      const timer = setTimeout(() => { load(); setRefreshKey((k) => k + 1); }, 4000);
      return () => clearTimeout(timer);
    }
    if (params.get('error')) {
      setError(t('banner.error', { message: params.get('error') }));
      setParams({}, { replace: true });
    }
    return undefined;
  }, [params, setParams, t, load]);

  const act = async (key, fn, after) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if (after) after(r);
      await load();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy('');
    }
  };

  const startConnect = () => act('connect', async () => {
    const { data } = await connectLinkedIn();
    window.location.assign(data.url);
  });

  if (!info) {
    return (
      <div className="page page-wide">
        <SettingsCategories />
        {error ? <div className="error-box">{error}</div> : <p className="hint">{t('common:states.loading')}</p>}
      </div>
    );
  }

  const conn = info.connection;
  const can = info.canManage;
  const reconnectSoon = conn?.reconnectBy && new Date(conn.reconnectBy).getTime() - Date.now() < SOON_MS;
  const accountName = (urn) => conn?.adAccounts.find((a) => a.accountUrn === urn)?.name || urn;
  const stageOptions = statuses.filter((s) => !s.isDefault);
  // LinkedIn role codes (ACCOUNT_MANAGER) shown as words.
  const roleText = (role) => (role ? role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, ' ') : '-');

  return (
    <div className="page page-wide">
      <SettingsCategories />
      <div className="li-header">
        <LinkedInMark size={44} />
        <div>
          <h1>{t('catalog.linkedinName')}</h1>
          <p className="hint">{t('catalog.linkedinDescription')}</p>
        </div>
        <Link to="/settings/connectors" className="li-back">← {t('page.title')}</Link>
      </div>

      {notice && <div className="success-flash">{notice}</div>}
      {error && <div className="error-box">{error}</div>}
      {!info.configured && <div className="info-box">{t('banner.notConfigured')}</div>}
      {conn?.status === 'EXPIRED' && <div className="error-box">{t('banner.expired')}</div>}
      {conn?.status === 'CONNECTED' && reconnectSoon && <div className="info-box">{t('banner.reconnectSoon', { date: formatDate(conn.reconnectBy, tz) })}</div>}
      {!can && <div className="info-box">{t('connection.noPermission')}</div>}

      {!conn && (
        <div className="card li-connect">
          <h3>{t('connect.title')}</h3>
          <p>{t('connect.intro')}</p>
          <h4 className="li-subhead">{t('connect.needTitle')}</h4>
          <ul className="li-checklist">
            <li>{t('connect.need1')}</li>
            <li>{t('connect.need2')}</li>
            <li>{t('connect.need3')}</li>
          </ul>
          <button type="button" className="primary li-connect-btn" disabled={!can || !info.configured || busy === 'connect'} onClick={startConnect}>
            {busy === 'connect' ? t('connect.redirecting') : t('connect.button')}
          </button>
        </div>
      )}

      {conn && (
        <>
          <div className="card">
            <div className="li-section-head">
              <h3>{t('connection.title')} <span className={`badge ${conn.status === 'CONNECTED' ? 'accepted' : 'rejected'}`}>{t(`status.${conn.status}`)}</span></h3>
              {can && (
                <div className="li-filters">
                  {conn.status === 'CONNECTED' ? (
                    <>
                      <button
                        type="button" className="primary" disabled={!!busy}
                        onClick={() => act('sync', syncLinkedIn, ({ data }) => {
                          const l = data.result.leads || {};
                          setNotice(t('connection.syncResult', { received: l.received || 0, created: l.CREATED || 0, duplicates: l.DUPLICATE || 0, rejected: l.REJECTED || 0 }));
                        })}
                      >
                        {busy === 'sync' ? t('connection.syncing') : t('connection.syncNow')}
                      </button>
                      <button type="button" className="secondary" disabled={!!busy} onClick={() => act('accounts', refreshLinkedInAccounts)}>{t('connection.refreshAccounts')}</button>
                    </>
                  ) : (
                    <button type="button" className="primary" disabled={!!busy} onClick={startConnect}>{t('connect.reconnect')}</button>
                  )}
                  <button
                    type="button" className="danger" disabled={!!busy}
                    onClick={() => window.confirm(t('connection.confirmDisconnect')) && act('disconnect', disconnectLinkedIn)}
                  >
                    {t('connection.disconnect')}
                  </button>
                </div>
              )}
            </div>
            <dl className="li-facts">
              <div><dt>{t('connection.member')}</dt><dd>{conn.memberName || '-'}</dd></div>
              <div><dt>{t('connection.connectedBy')}</dt><dd>{conn.connectedBy || '-'}</dd></div>
              <div><dt>{t('connection.connectedAt')}</dt><dd>{formatDateTime(conn.connectedAt, tz)}</dd></div>
              <div>
                <dt>{t('connection.reconnectBy')}</dt>
                <dd>{conn.reconnectBy ? formatDate(conn.reconnectBy, tz) : '-'}<span className="secondary-cell"> · {conn.autoRenews ? t('connection.autoRenews') : t('connection.noAutoRenew')}</span></dd>
              </div>
              <div><dt>{t('connection.lastSync')}</dt><dd>{conn.lastSyncAt ? formatDateTime(conn.lastSyncAt, tz) : t('connection.never')}</dd></div>
              <div><dt>{t('connection.nextSync')}</dt><dd>{conn.status === 'CONNECTED' && conn.nextSyncAt ? formatDateTime(conn.nextSyncAt, tz) : '-'}</dd></div>
            </dl>
            {conn.lastError && <div className="error-box">{t('banner.lastError', { time: formatDateTime(conn.lastErrorAt, tz), message: conn.lastError })}</div>}

            {can && conn.status === 'CONNECTED' && (
              <form
                className="li-range-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  act('range', () => fetchLinkedInRange(range), ({ data }) => {
                    const l = data.result.leads;
                    setNotice(t('connection.fetchResult', { ...range, received: l.received, created: l.CREATED, duplicates: l.DUPLICATE, rejected: l.REJECTED, skipped: l.skipped }));
                  });
                }}
              >
                <h4 className="li-subhead">{t('connection.fetchTitle')}</h4>
                <p className="hint">{t('connection.fetchHint')}</p>
                <div className="li-range-row">
                  <div className="field">
                    <label htmlFor="li-from">{t('connection.from')}</label>
                    <input id="li-from" type="date" value={range.from} max={range.to} required onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label htmlFor="li-to">{t('connection.to')}</label>
                    <input id="li-to" type="date" value={range.to} min={range.from} max={today} required onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
                  </div>
                  <button type="submit" className="secondary" disabled={!!busy}>{busy === 'range' ? t('connection.fetching') : t('connection.fetch')}</button>
                </div>
              </form>
            )}
          </div>

          <div className="li-two-col">
            <div className="card">
              <h3>{t('accounts.title')}</h3>
              <p className="hint">{t('accounts.intro')}</p>
              {conn.adAccounts.length === 0 ? <p className="hint">{t('accounts.none')}</p> : (
                <div className="table-scroll">
                  <table className="pro-table">
                    <thead><tr><th>{t('accounts.sync')}</th><th>{t('accounts.name')}</th><th>{t('accounts.currency')}</th><th>{t('accounts.role')}</th></tr></thead>
                    <tbody>
                      {conn.adAccounts.map((a) => (
                        <tr key={a.accountUrn}>
                          <td>
                            <input
                              type="checkbox" checked={a.enabled} disabled={!can || !!busy} aria-label={`${t('accounts.sync')} ${a.name}`}
                              onChange={(e) => act('account', () => updateLinkedInConnector({ adAccounts: [{ accountUrn: a.accountUrn, enabled: e.target.checked }] }))}
                            />
                          </td>
                          <td title={a.accountUrn}>
                            <span className="primary-cell">{a.name || a.accountUrn}</span>
                            {a.enabled && <span className="secondary-cell li-account-sync">{a.realtime ? t('accounts.realtime') : t('accounts.scheduled', { minutes: formatNumber(conn.settings.syncMinutes) })}</span>}
                          </td>
                          <td>{a.currency || '-'}</td>
                          <td>{roleText(a.role)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                act('settings', () => updateLinkedInConnector({
                  defaultCountry: String(form.defaultCountry || '').toUpperCase(), syncMinutes: Number(form.syncMinutes), includeTestLeads: form.includeTestLeads
                }), () => setNotice(t('settings.saved')));
              }}
            >
              <h3>{t('settings.title')}</h3>
              <div className="field">
                <label htmlFor="li-country">{t('settings.defaultCountry')}</label>
                <input
                  id="li-country" value={form?.defaultCountry || ''} maxLength={2} disabled={!can} style={{ maxWidth: 90, textTransform: 'uppercase' }}
                  onChange={(e) => setForm((f) => ({ ...f, defaultCountry: e.target.value.toUpperCase() }))}
                />
                <span className="hint">{t('settings.defaultCountryHint')}</span>
              </div>
              <div className="field">
                <label htmlFor="li-sync">{t('settings.syncMinutes')}</label>
                <select id="li-sync" value={form?.syncMinutes || 10} disabled={!can} onChange={(e) => setForm((f) => ({ ...f, syncMinutes: Number(e.target.value) }))} style={{ maxWidth: 200 }}>
                  {SYNC_CHOICES.map((m) => <option key={m} value={m}>{t('settings.minutes', { count: formatNumber(m) })}</option>)}
                </select>
              </div>
              <label className="li-check">
                <input type="checkbox" checked={Boolean(form?.includeTestLeads)} disabled={!can} onChange={(e) => setForm((f) => ({ ...f, includeTestLeads: e.target.checked }))} />
                {t('settings.includeTestLeads')}
              </label>
              {can && <button type="submit" className="primary" disabled={!!busy} style={{ marginTop: '0.8rem' }}>{t('settings.save')}</button>}
            </form>
          </div>

          <LinkedInPerformance refreshKey={refreshKey} />

          <div className="card">
            <div className="li-section-head">
              <h3>{t('capi.title')}</h3>
              <label className="li-check">
                <input
                  type="checkbox" checked={conn.settings.capiEnabled} disabled={!can || !!busy}
                  onChange={(e) => act('capi', () => updateLinkedInConnector({ capiEnabled: e.target.checked }))}
                />
                {t('capi.enabled')}
              </label>
            </div>
            <p className="hint">{t('capi.intro')}</p>
            <h4 className="li-subhead">{t('capi.rules')}</h4>
            {conn.settings.capiRules.length === 0 ? <p className="hint">{t('capi.noRules')}</p> : (
              <div className="table-scroll">
                <table className="pro-table">
                  <thead><tr><th>{t('capi.status')}</th><th>{t('capi.type')}</th><th>{t('capi.account')}</th><th>{t('capi.conversion')}</th><th /></tr></thead>
                  <tbody>
                    {conn.settings.capiRules.map((r) => (
                      <tr key={`${r.stage}|${r.accountUrn}`}>
                        <td className="primary-cell">{statusLabel(r.stage)}</td>
                        <td>{t(`capi.types.${r.conversionType}`)}</td>
                        <td>{accountName(r.accountUrn)}</td>
                        <td className="secondary-cell" title={r.conversionUrn}>{r.name || r.conversionUrn}</td>
                        <td>
                          {can && (
                            <button type="button" className="link-button" disabled={!!busy} onClick={() => act('rule', () => updateLinkedInConnector({ removeCapiRules: [{ stage: r.stage, accountUrn: r.accountUrn }] }))}>
                              {t('capi.remove')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {can && conn.status === 'CONNECTED' && conn.adAccounts.length > 0 && (
              <form
                className="li-rule-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  act('rule', () => createLinkedInConversionRule(rule), () => setNotice(t('capi.created')));
                }}
              >
                <div className="field">
                  <label htmlFor="li-rule-stage">{t('capi.status')}</label>
                  <select id="li-rule-stage" value={rule.stage} required onChange={(e) => setRule((r) => ({ ...r, stage: e.target.value, conversionType: statuses.find((s) => s.name === e.target.value)?.isBooking ? 'PURCHASE' : r.conversionType }))}>
                    <option value="">-</option>
                    {stageOptions.map((s) => <option key={s.name} value={s.name}>{statusLabel(s.name)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="li-rule-type">{t('capi.type')}</label>
                  <select id="li-rule-type" value={rule.conversionType} onChange={(e) => setRule((r) => ({ ...r, conversionType: e.target.value }))}>
                    {info.conversionTypes.map((x) => <option key={x} value={x}>{t(`capi.types.${x}`)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="li-rule-account">{t('capi.account')}</label>
                  <select id="li-rule-account" value={rule.accountUrn} required onChange={(e) => setRule((r) => ({ ...r, accountUrn: e.target.value }))}>
                    {conn.adAccounts.map((a) => <option key={a.accountUrn} value={a.accountUrn}>{a.name || a.accountUrn}</option>)}
                  </select>
                </div>
                <button type="submit" className="primary" disabled={!!busy}>{busy === 'rule' ? t('capi.adding') : t('capi.add')}</button>
              </form>
            )}
          </div>
        </>
      )}

      <LinkedInActivityLog types={info.activityTypes} refreshKey={refreshKey} />
    </div>
  );
}
