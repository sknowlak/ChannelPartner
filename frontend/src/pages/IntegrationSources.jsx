import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import {
  createIntegrationSource, deleteIntegrationSource, getMyProfile, listInboundEvents, listIntegrationSources, listLeadFields,
  listLeadStatuses, regenerateSourceKey, runIntegrationSource, testIntegrationSource, updateIntegrationSource
} from '../api/client';
import SettingsCategories from '../components/SettingsCategories';
import IntegrationTabs from '../components/IntegrationTabs';
import AuthEditor from '../components/AuthEditor';
import { PERMISSIONS } from '../utils/permissions';
import { formatDateTime } from '../utils/timezone';
import { fieldLabel, groupLabel, optionLabel, statusLabel, useDataLabels } from '../i18n/dataLabels';

// Settings -> Integrations -> Receive / Pull (section 51): leads coming in
// from any other system, in THAT system's own format. One page for both
// kinds - they share the field mapping, status mapping, preview and log.
//   RECEIVE: they call the source's URL (Facebook lead ads, Zapier, a website form, another CRM's webhook).
//   PULL:    Leadrat calls their API on a schedule.

// Paging types are API values; labels are integrations:pull.paging.* with the
// literal URL variable passed in as {{token}} (not interpolated by i18next).
const PAGINATION = [
  { value: 'NONE' },
  { value: 'PAGE', token: '{{page}}' },
  { value: 'OFFSET', token: '{{offset}}' },
  { value: 'CURSOR', token: '{{cursor}}' },
  { value: 'NEXT_URL' }
];
// Elements for react-i18next <Trans>; code snippets carry their own literal text.
const RICH_TEXT = {
  strong: <strong />,
  since: <code>{'{{since}}'}</code>,
  others: <span><code>{'{{sinceEpoch}}'}</code>, <code>{'{{page}}'}</code>, <code>{'{{offset}}'}</code>, <code>{'{{limit}}'}</code>, <code>{'{{cursor}}'}</code></span>,
  paths: <span><code>{'data'}</code>, <code>{'items'}</code>, <code>{'entry.0.changes'}</code></span>
};
const OUTCOME_CLASS = { CREATED: 'accepted', UPDATED: 'accepted', UNCHANGED: 'pending', DUPLICATE: 'pending', REJECTED: 'rejected', FAILED: 'rejected' };

const emptyForm = (kind) => ({
  name: '', isEnabled: true, recordsPath: '', externalIdPath: '', defaultCountry: 'IN', updateExisting: true,
  rows: {}, statusMap: [], verifyAuth: { type: 'NONE' }, verifyToken: '',
  url: '', method: 'GET', headersText: '{}', bodyTemplate: '', auth: { type: 'NONE' },
  pagination: { type: 'NONE', pageSize: 50, startPage: 1, cursorPath: '', nextUrlPath: '', maxPages: 10 },
  intervalMinutes: 15, kind
});

// Mapping is stored as a list; the form keeps one row per OUR field.
function rowsFromMapping(mapping) {
  const rows = {};
  for (const m of mapping || []) rows[m.fieldKey] = { source: m.source, path: m.path || '', value: m.value ?? '' };
  return rows;
}
function mappingFromRows(rows) {
  return Object.entries(rows)
    .filter(([, r]) => r.source === 'FIXED' ? r.value !== '' : r.path)
    .map(([fieldKey, r]) => ({ fieldKey, source: r.source, path: r.source === 'PATH' ? r.path : '', value: r.source === 'FIXED' ? r.value : '' }));
}

// Pre-fills the mapping from the sample by matching their field names to
// ours (name/full_name -> Name, phone/mobile -> Primary Number, ...).
const SYNONYMS = {
  name: ['name', 'fullname', 'full_name', 'customername', 'contactname', 'leadname'],
  mobile: ['mobile', 'phone', 'phonenumber', 'phone_number', 'mobilenumber', 'contact', 'contactno', 'cell'],
  email: ['email', 'emailaddress', 'mail'],
  alternateMobile: ['alternatemobile', 'altphone', 'secondaryphone', 'phone2'],
  notes: ['notes', 'note', 'message', 'comments', 'remarks'],
  preferredLocation: ['location', 'city', 'area', 'locality'],
  budgetMax: ['budget', 'maxbudget', 'budgetmax'],
  projectId: ['project', 'projectname', 'projectid']
};
const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
function suggestRows(paths, fieldDefs, current) {
  const rows = { ...current };
  for (const def of fieldDefs) {
    if (rows[def.fieldKey]) continue;
    const wanted = new Set([squash(def.fieldKey), squash(def.label), ...(SYNONYMS[def.fieldKey] || []).map(squash)]);
    const hit = paths.find((p) => wanted.has(squash(p.path.split('.').pop())));
    if (hit) rows[def.fieldKey] = { source: 'PATH', path: hit.path, value: '' };
  }
  return rows;
}
// Paths inside one record (the sample's paths are relative to the whole body).
function recordPaths(paths, recordsPath) {
  if (!recordsPath) return paths;
  const prefix = `${recordsPath}.0.`;
  const alt = `${recordsPath}.`;
  return paths
    .filter((p) => p.path.startsWith(prefix) || p.path.startsWith(alt))
    .map((p) => ({ ...p, path: p.path.startsWith(prefix) ? p.path.slice(prefix.length) : p.path.slice(alt.length) }));
}

export default function IntegrationSources({ kind }) {
  const { t, i18n } = useTranslation(['integrations', 'common']);
  useDataLabels();
  const outcomeLabel = (o) => t(`outcomes.${o}`, { defaultValue: o });
  const isPull = kind === 'PULL';
  const [permissions, setPermissions] = useState([]);
  const [sources, setSources] = useState(null);
  const [fieldDefs, setFieldDefs] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sampleText, setSampleText] = useState('');
  const [test, setTest] = useState(null);
  const [events, setEvents] = useState(null);
  const [eventFilter, setEventFilter] = useState({ sourceId: '', outcome: '' });
  const [showAllFields, setShowAllFields] = useState(false);
  const [previewedMapping, setPreviewedMapping] = useState('');

  const canManage = permissions.includes(PERMISSIONS.MANAGE_SETTINGS);
  const reasonOf = (err) => err.response?.data?.reason || err.message;

  const load = () => {
    Promise.all([getMyProfile(), listIntegrationSources(), listLeadFields(), listLeadStatuses()])
      .then(([{ data: me }, { data: src }, { data: fields }, { data: st }]) => {
        setPermissions(me.permissions || []);
        setSources(src.sources.filter((s) => s.kind === kind));
        setFieldDefs(fields.definitions.filter((d) => d.isEnabled));
        setStatuses(st.statuses.filter((s) => s.isActive));
      })
      .catch((err) => setError(reasonOf(err)));
  };
  const loadEvents = () => {
    const params = {};
    if (eventFilter.sourceId) params.sourceId = eventFilter.sourceId;
    if (eventFilter.outcome) params.outcome = eventFilter.outcome;
    listInboundEvents(params).then(({ data }) => setEvents(data.events)).catch((err) => setError(reasonOf(err)));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); setForm(null); setTest(null); }, [kind]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadEvents, [eventFilter, kind]);

  const sourceIds = useMemo(() => new Set((sources || []).map((s) => s.sourceId)), [sources]);
  const visibleEvents = (events || []).filter((e) => sourceIds.has(e.sourceId));

  // Display-only labels (translated defaults); matching in suggestRows uses fieldDefs.
  const targetFields = useMemo(() => [
    ...fieldDefs.map((d) => ({ fieldKey: d.fieldKey, label: fieldLabel(d), group: groupLabel(d.group), required: d.isCore, options: d.dataType === 'SELECT' ? d.options : null })),
    { fieldKey: 'stage', label: t('common:fields.status'), group: t('common:fields.status') },
    { fieldKey: 'subStatus', label: t('sources.subStatus'), group: t('common:fields.status') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [fieldDefs, i18n.language]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm(kind));
    setTest(null);
    setSampleText('');
  };
  const startEdit = (s) => {
    setEditingId(s.sourceId);
    setForm({
      ...emptyForm(kind),
      ...s,
      rows: rowsFromMapping(s.mapping),
      statusMap: s.statusMap || [],
      headersText: JSON.stringify(s.headers || {}, null, 2),
      pagination: { ...emptyForm(kind).pagination, ...(s.pagination || {}) }
    });
    setTest(null);
    setSampleText(s.sampleBody ? JSON.stringify(s.sampleBody, null, 2) : '');
  };

  const buildPayload = () => {
    const payload = {
      name: form.name, isEnabled: form.isEnabled, recordsPath: form.recordsPath, externalIdPath: form.externalIdPath,
      defaultCountry: form.defaultCountry, updateExisting: form.updateExisting,
      mapping: mappingFromRows(form.rows), statusMap: form.statusMap.filter((m) => m.from && m.to)
    };
    if (isPull) {
      let headers;
      try { headers = JSON.parse(form.headersText || '{}'); } catch { throw new Error(t('push.headersInvalid', { example: '{"Accept": "application/json"}' })); }
      Object.assign(payload, {
        url: form.url, method: form.method, headers, bodyTemplate: form.bodyTemplate, auth: form.auth,
        pagination: form.pagination, intervalMinutes: Number(form.intervalMinutes)
      });
    } else {
      Object.assign(payload, { verifyAuth: form.verifyAuth, verifyToken: form.verifyToken });
    }
    return payload;
  };

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = buildPayload();
      if (editingId) {
        const { data } = await updateIntegrationSource(editingId, payload);
        startEdit(data);
      } else {
        const { data } = await createIntegrationSource({ ...payload, kind });
        startEdit(data); // stay in the form: a receive source now has its URL to share
      }
      load();
    } catch (err) {
      setError(reasonOf(err));
    } finally {
      setBusy(false);
    }
  };

  // Fetches (pull) or uses the pasted/last-received sample (receive), and
  // previews what the CURRENT, unsaved mapping turns it into.
  const runTest = async () => {
    if (!editingId) { setError(t('sources.saveFirst')); return; }
    setBusy(true);
    setError(null);
    try {
      const payload = { draft: buildPayload() };
      if (!isPull && sampleText.trim()) {
        try { payload.sample = JSON.parse(sampleText); } catch { throw new Error(t('sources.sampleInvalid')); }
      }
      const { data } = await testIntegrationSource(editingId, payload);
      setTest(data);
      setPreviewedMapping(JSON.stringify([payload.draft.mapping, payload.draft.statusMap, payload.draft.recordsPath, payload.draft.externalIdPath]));
      if (data.sample && !sampleText.trim()) setSampleText(JSON.stringify(data.sample, null, 2));
    } catch (err) {
      setError(reasonOf(err));
    } finally {
      setBusy(false);
    }
  };

  const autoMap = () => {
    if (!test) return;
    setForm((f) => ({ ...f, rows: suggestRows(recordPaths(test.paths, f.recordsPath), fieldDefs, f.rows) }));
  };

  const runNow = async (s) => {
    try {
      const { data } = await runIntegrationSource(s.sourceId);
      window.alert(data.error
        ? t('pull.runFailed', { error: data.error })
        : [
          t('pull.runPulled', { count: data.received, pages: t('pull.pageCount', { count: data.pages }) }),
          t('pull.runResult', { created: data.CREATED, updated: data.UPDATED, duplicate: data.DUPLICATE, failed: data.FAILED + data.REJECTED })
        ].join(' '));
      load();
      loadEvents();
    } catch (err) {
      setError(reasonOf(err));
    }
  };
  const toggle = async (s) => {
    try { await updateIntegrationSource(s.sourceId, { isEnabled: !s.isEnabled }); load(); } catch (err) { setError(reasonOf(err)); }
  };
  const remove = async (s) => {
    if (!window.confirm(t('sources.deleteConfirm', { name: s.name }))) return;
    try { await deleteIntegrationSource(s.sourceId); if (editingId === s.sourceId) setForm(null); load(); } catch (err) { setError(reasonOf(err)); }
  };
  const newKey = async () => {
    if (!window.confirm(t('receive.newUrlConfirm'))) return;
    try { const { data } = await regenerateSourceKey(editingId); startEdit(data); load(); } catch (err) { setError(reasonOf(err)); }
  };

  const setRow = (fieldKey, patch) => setForm((f) => ({ ...f, rows: { ...f.rows, [fieldKey]: { source: 'PATH', path: '', value: '', ...f.rows[fieldKey], ...patch } } }));
  const setPaging = (patch) => setForm((f) => ({ ...f, pagination: { ...f.pagination, ...patch } }));
  const pathOptions = test ? recordPaths(test.paths, form?.recordsPath) : [];
  const sampleFor = (path) => pathOptions.find((p) => p.path === path)?.sample;

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="form-section-title" style={{ marginTop: 0 }}>
            <span>{isPull ? t('pull.title') : t('receive.title')}</span>
          </h3>
          {canManage && (
            <button className="pill-primary" onClick={form ? () => setForm(null) : startCreate}>{form ? t('common:actions.close') : isPull ? t('pull.add') : t('receive.add')}</button>
          )}
        </div>
        <p className="hint">
          {isPull ? t('pull.intro') : t('receive.intro')}
        </p>

        {form && canManage && (
          <form className="card" onSubmit={save} style={{ background: '#f8f9fb' }}>
            <div className="form-grid">
              <div className="field">
                <label>{t('sources.nameRequired')}</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required placeholder={isPull ? t('pull.namePlaceholder') : t('receive.namePlaceholder')} />
              </div>
              {isPull && (
                <div className="field">
                  <label>{t('pull.interval')}</label>
                  <select value={form.intervalMinutes} onChange={(e) => setForm((f) => ({ ...f, intervalMinutes: e.target.value }))}>
                    {[5, 15, 30, 60, 180, 360, 720, 1440].map((m) => <option key={m} value={m}>{m < 60 ? t('pull.minutes', { count: m }) : t('pull.hours', { count: m / 60 })}</option>)}
                  </select>
                </div>
              )}
            </div>

            {!isPull && editingId && (
              <div className="info-box">
                <Trans t={t} i18nKey="receive.urlIntro" components={RICH_TEXT} />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                  <input readOnly value={form.receiveUrl || ''} style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }} />
                  <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(form.receiveUrl || '')}>{t('common:actions.copy')}</button>
                  <button type="button" className="danger" onClick={newKey}>{t('receive.newUrl')}</button>
                </div>
                <div style={{ marginTop: '0.4rem' }}>{t('receive.sendExample')}</div>
              </div>
            )}
            {!isPull && !editingId && <p className="hint">{t('receive.saveForUrl')}</p>}

            {isPull && (
              <>
                <div className="form-grid">
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>{t('pull.apiUrl')}</label>
                    <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} required placeholder="https://api.example.com/leads?updated_since={{since}}&page={{page}}&per_page={{limit}}" />
                    <span className="hint" style={{ fontSize: '0.78rem' }}>
                      <Trans t={t} i18nKey="pull.variables" components={RICH_TEXT} />
                    </span>
                  </div>
                  <div className="field">
                    <label>{t('pull.method')}</label>
                    <select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
                      <option value="GET">GET</option>{/* i18n-ignore: HTTP method */}
                      <option value="POST">POST</option>{/* i18n-ignore: HTTP method */}
                    </select>
                  </div>
                  <div className="field">
                    <label>{t('pull.headers')}</label>
                    <textarea rows={2} value={form.headersText} onChange={(e) => setForm((f) => ({ ...f, headersText: e.target.value }))} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
                  </div>
                  {form.method === 'POST' && (
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label>{t('pull.body')}</label>
                      <textarea rows={3} value={form.bodyTemplate} onChange={(e) => setForm((f) => ({ ...f, bodyTemplate: e.target.value }))} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} placeholder='{"since":"{{since}}","page":{{page}}}' />
                    </div>
                  )}
                </div>
                <AuthEditor value={form.auth} onChange={(auth) => setForm((f) => ({ ...f, auth }))} />
                <div className="form-grid">
                  <div className="field">
                    <label>{t('pull.paging')}</label>
                    <select value={form.pagination.type} onChange={(e) => setPaging({ type: e.target.value })}>
                      {PAGINATION.map((p) => <option key={p.value} value={p.value}>{t(`pull.pagingTypes.${p.value}`, { token: p.token })}</option>)}
                    </select>
                  </div>
                  {form.pagination.type !== 'NONE' && (
                    <>
                      <div className="field"><label>{t('pull.pageSize', { token: '{{limit}}' })}</label><input type="number" min={1} max={1000} value={form.pagination.pageSize} onChange={(e) => setPaging({ pageSize: e.target.value })} /></div>
                      <div className="field"><label>{t('pull.maxPages')}</label><input type="number" min={1} max={50} value={form.pagination.maxPages} onChange={(e) => setPaging({ maxPages: e.target.value })} /></div>
                    </>
                  )}
                  {form.pagination.type === 'PAGE' && (
                    <div className="field"><label>{t('pull.startPage')}</label><input type="number" value={form.pagination.startPage} onChange={(e) => setPaging({ startPage: e.target.value })} /></div>
                  )}
                  {form.pagination.type === 'CURSOR' && (
                    <div className="field"><label>{t('pull.cursorPath')}</label><input value={form.pagination.cursorPath} onChange={(e) => setPaging({ cursorPath: e.target.value })} placeholder={t('pull.cursorPathPlaceholder')} /></div>
                  )}
                  {form.pagination.type === 'NEXT_URL' && (
                    <div className="field"><label>{t('pull.nextUrlPath')}</label><input value={form.pagination.nextUrlPath} onChange={(e) => setPaging({ nextUrlPath: e.target.value })} placeholder={t('pull.nextUrlPathPlaceholder')} /></div>
                  )}
                </div>
              </>
            )}

            {!isPull && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#444' }}>{t('receive.security')}</summary>
                <AuthEditor value={form.verifyAuth} onChange={(verifyAuth) => setForm((f) => ({ ...f, verifyAuth }))} allowedTypes={['NONE', 'HMAC']} direction="inbound" title={t('receive.securityAuthTitle')} />
                <div className="field">
                  <label>{t('receive.verifyToken')}</label>
                  <input value={form.verifyToken} onChange={(e) => setForm((f) => ({ ...f, verifyToken: e.target.value }))} />
                </div>
              </details>
            )}

            <h4 style={{ margin: '1rem 0 0.4rem' }}>{t('sources.step1')}</h4>
            {isPull ? (
              <p className="hint" style={{ marginTop: 0 }}><Trans t={t} i18nKey="pull.sampleHelp" components={RICH_TEXT} /></p>
            ) : (
              <div className="field">
                <label>{t('receive.sampleLabel')}</label>
                <textarea rows={5} value={sampleText} onChange={(e) => setSampleText(e.target.value)} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} placeholder='{"leads":[{"id":"123","full_name":"Jane","phone":"9876543210"}]}' />
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <button type="button" className="secondary" onClick={runTest} disabled={busy}>{isPull ? t('pull.fetchSample') : t('receive.previewSample')}</button>
              {test && <button type="button" className="secondary" onClick={autoMap}>{t('sources.autoMap')}</button>}
            </div>
            {test && <p className="hint">{t('sources.sampleFound', { count: test.records, fields: t('sources.fieldCount', { count: pathOptions.length }) })}</p>}

            <h4 style={{ margin: '1rem 0 0.4rem' }}>{t('sources.step2')}</h4>
            <datalist id="their-paths">{pathOptions.map((p) => <option key={p.path} value={p.path}>{String(p.sample ?? '').slice(0, 40)}</option>)}</datalist>
            <datalist id="all-paths">{(test?.paths || []).map((p) => <option key={p.path} value={p.path} />)}</datalist>
            <div className="form-grid">
              <div className="field">
                <label>{t('sources.recordsPath')}</label>
                <input list="all-paths" value={form.recordsPath} onChange={(e) => setForm((f) => ({ ...f, recordsPath: e.target.value }))} placeholder={t('sources.recordsPathPlaceholder')} />
                <span className="hint" style={{ fontSize: '0.78rem' }}><Trans t={t} i18nKey="sources.recordsPathHint" components={RICH_TEXT} /></span>
              </div>
              <div className="field">
                <label>{t('sources.externalIdPath')}</label>
                <input list="their-paths" value={form.externalIdPath} onChange={(e) => setForm((f) => ({ ...f, externalIdPath: e.target.value }))} placeholder={t('sources.externalIdPathPlaceholder')} />
              </div>
              <div className="field">
                <label>{t('sources.defaultCountry')}</label>
                <input value={form.defaultCountry} maxLength={2} onChange={(e) => setForm((f) => ({ ...f, defaultCountry: e.target.value.toUpperCase() }))} placeholder="IN" />{/* i18n-ignore: country code */}
              </div>
              <div className="field">
                <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontWeight: 400, marginTop: '1.6rem' }}>
                  <input type="checkbox" checked={form.updateExisting} onChange={(e) => setForm((f) => ({ ...f, updateExisting: e.target.checked }))} />
                  {t('sources.updateExisting')}
                </label>
              </div>
            </div>

            <div className="table-scroll">
              <table className="pro-table">
                <thead><tr><th>{t('sources.colYourField')}</th><th>{t('sources.colFilledFrom')}</th><th>{t('sources.colTheirField')}</th><th>{t('sources.colSample')}</th></tr></thead>
                <tbody>
                  {[...targetFields]
                    .sort((a, b) => (b.required ? 2 : form.rows[b.fieldKey] ? 1 : 0) - (a.required ? 2 : form.rows[a.fieldKey] ? 1 : 0))
                    .filter((tf) => showAllFields || tf.required || form.rows[tf.fieldKey])
                    .map((tf) => {
                    const row = form.rows[tf.fieldKey] || { source: 'NONE' };
                    const mode = form.rows[tf.fieldKey] ? row.source : 'NONE';
                    return (
                      <tr key={tf.fieldKey}>
                        <td className="primary-cell">{tf.label}{tf.required ? ' *' : ''}<div className="hint" style={{ fontSize: '0.72rem' }}>{tf.group}</div></td>
                        <td>
                          <select value={mode} onChange={(e) => {
                            const v = e.target.value;
                            if (v === 'NONE') setForm((f) => { const rows = { ...f.rows }; delete rows[tf.fieldKey]; return { ...f, rows }; });
                            else setRow(tf.fieldKey, { source: v });
                          }}>
                            <option value="NONE">{t('sources.sourceNone')}</option>
                            <option value="PATH">{t('sources.sourcePath')}</option>
                            <option value="FIXED">{t('sources.sourceFixed')}</option>
                          </select>
                        </td>
                        <td>
                          {mode === 'PATH' && <input list="their-paths" value={row.path} onChange={(e) => setRow(tf.fieldKey, { path: e.target.value })} placeholder={t('sources.pathPlaceholder')} style={{ width: '100%', minWidth: '220px' }} />}
                          {mode === 'FIXED' && (tf.options
                            ? <select value={row.value} onChange={(e) => setRow(tf.fieldKey, { value: e.target.value })}><option value="">{t('sources.choose')}</option>{tf.options.map((o) => <option key={o} value={o}>{optionLabel(o)}</option>)}</select>
                            : <input value={row.value} onChange={(e) => setRow(tf.fieldKey, { value: e.target.value })} style={{ width: '100%', minWidth: '220px' }} />)}
                        </td>
                        <td className="secondary-cell">{mode === 'PATH' ? String(sampleFor(row.path) ?? '').slice(0, 40) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" className="link-button" onClick={() => setShowAllFields((v) => !v)}>
              {showAllFields ? t('sources.showMapped') : t('sources.showAll', { count: targetFields.length })}
            </button>

            <h4 style={{ margin: '1rem 0 0.4rem' }}>{t('sources.step3')}</h4>
            <p className="hint" style={{ marginTop: 0 }}>{t('sources.statusMapHelp')}</p>
            {form.statusMap.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <input value={m.from}  placeholder={t('sources.statusFromPlaceholder')} onChange={(e) => setForm((f) => ({ ...f, statusMap: f.statusMap.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) }))} />
                <select value={m.to} onChange={(e) => setForm((f) => ({ ...f, statusMap: f.statusMap.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) }))}>
                  <option value="">{t('sources.statusToPlaceholder')}</option>
                  {statuses.filter((s) => !s.isBooking).map((s) => <option key={s.statusId} value={s.name}>{statusLabel(s.name)}</option>)}
                </select>
                <button type="button" className="secondary" onClick={() => setForm((f) => ({ ...f, statusMap: f.statusMap.filter((_, j) => j !== i) }))}>{t('common:actions.remove')}</button>
              </div>
            ))}
            <button type="button" className="link-button" onClick={() => setForm((f) => ({ ...f, statusMap: [...f.statusMap, { from: '', to: '' }] }))}>{t('sources.addStatus')}</button>

            {test && test.preview && (
              <>
                <h4 style={{ margin: '1rem 0 0.4rem' }}>{t('sources.previewTitle')}</h4>
                {previewedMapping !== JSON.stringify([mappingFromRows(form.rows), form.statusMap.filter((m) => m.from && m.to), form.recordsPath, form.externalIdPath]) && (
                  <p className="hint" style={{ marginTop: 0 }}>
                    <Trans t={t} i18nKey="sources.previewStale" components={{ action: <button type="button" className="link-button" onClick={runTest} /> }} />
                  </p>
                )}
                <textarea readOnly rows={10} value={JSON.stringify(test.preview, null, 2)} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem', background: '#f3f4f7' }} />
              </>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="primary" type="submit" disabled={busy}>{busy ? t('common:actions.saving') : editingId ? t('common:actions.saveChanges') : t('common:actions.create')}</button>
              <button type="button" className="secondary" onClick={() => setForm(null)}>{t('common:actions.close')}</button>
            </div>
          </form>
        )}

        <table className="pro-table">
          <thead>
            <tr>
              <th>{t('common:fields.name')}</th>
              <th>{isPull ? t('pull.colApi') : t('receive.colMapping')}</th>
              <th>{isPull ? t('pull.colLastRun') : t('receive.colLastSample')}</th>
              <th>{t('common:status.enabled')}</th>
              {canManage && <th>{t('common:fields.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {(sources || []).map((s) => (
              <tr key={s.sourceId}>
                <td className="primary-cell">{s.name}</td>
                <td className="secondary-cell">
                  {isPull ? `${s.method} ${s.url}` : t('receive.fieldsMapped', { count: s.mapping.length })}
                  {isPull && <div style={{ fontSize: '0.75rem' }}>{[t('pull.everyMinutes', { count: s.intervalMinutes }), s.auth?.type && s.auth.type !== 'NONE' && t(`authBadge.${s.auth.type}`, { defaultValue: s.auth.type })].filter(Boolean).join(' · ')}</div>}
                </td>
                <td className="secondary-cell">
                  {isPull && s.lastRunAt
                    ? <>{formatDateTime(s.lastRunAt)}<div style={{ fontSize: '0.75rem' }}>{s.lastResult?.error ? t('pull.lastError', { error: s.lastResult.error }) : t('pull.lastResult', { created: s.lastResult?.CREATED || 0, updated: s.lastResult?.UPDATED || 0, duplicate: s.lastResult?.DUPLICATE || 0 })}</div></>
                    : isPull ? t('pull.notRun') : s.sampleBody ? t('receive.received') : t('receive.waiting')}
                </td>
                <td>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={s.isEnabled} disabled={!canManage} onChange={() => toggle(s)} />
                    <span className="slider" />
                  </label>
                </td>
                {canManage && (
                  <td>
                    <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => startEdit(s)}>{t('common:actions.edit')}</button>
                    {isPull && <button className="secondary" style={{ marginRight: '0.4rem' }} onClick={() => runNow(s)}>{t('pull.runNow')}</button>}
                    <button className="danger" onClick={() => remove(s)}>{t('common:actions.delete')}</button>
                  </td>
                )}
              </tr>
            ))}
            {sources && sources.length === 0 && <tr><td colSpan={canManage ? 5 : 4} className="hint">{t('sources.empty')}</td></tr>}
          </tbody>
        </table>
        {!sources && !error && <p className="hint">{t('common:states.loading')}</p>}
      </div>

      <div className="card">
        <h3 className="form-section-title" style={{ marginTop: 0 }}><span>{t('inbound.title')}</span></h3>
        <p className="hint">{t('inbound.help')}</p>
        <div className="toolbar">
          <div className="toolbar-left">
            <select value={eventFilter.sourceId} onChange={(e) => setEventFilter((f) => ({ ...f, sourceId: e.target.value }))}>
              <option value="">{t('inbound.allSources')}</option>
              {(sources || []).map((s) => <option key={s.sourceId} value={s.sourceId}>{s.name}</option>)}
            </select>
            <select value={eventFilter.outcome} onChange={(e) => setEventFilter((f) => ({ ...f, outcome: e.target.value }))}>
              <option value="">{t('inbound.allOutcomes')}</option>
              {Object.keys(OUTCOME_CLASS).map((o) => <option key={o} value={o}>{outcomeLabel(o)}</option>)}
            </select>
            <button className="secondary" onClick={loadEvents}>{t('common:actions.refresh')}</button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="pro-table">
            <thead><tr><th>{t('common:fields.dateTime')}</th><th>{t('inbound.colSource')}</th><th>{t('inbound.colTheirId')}</th><th>{t('inbound.colOutcome')}</th><th>{t('deliveries.colLead')}</th><th>{t('inbound.colDetails')}</th></tr></thead>
            <tbody>
              {visibleEvents.map((ev) => (
                <tr key={ev.eventId}>
                  <td className="secondary-cell">{formatDateTime(ev.createdAt)}</td>
                  <td>{(sources || []).find((s) => s.sourceId === ev.sourceId)?.name || ev.sourceId}</td>
                  <td className="secondary-cell">{ev.externalId || '-'}</td>
                  <td><span className={`badge ${OUTCOME_CLASS[ev.outcome]}`}>{outcomeLabel(ev.outcome)}</span></td>
                  <td>{ev.registrationId ? <Link to={`/registrations/${ev.registrationId}`}>{ev.registrationId}</Link> : '-'}</td>
                  <td className="secondary-cell" title={ev.message}>{ev.message ? ev.message.slice(0, 80) : '-'}</td>
                </tr>
              ))}
              {events && visibleEvents.length === 0 && <tr><td colSpan={6} className="hint">{t('inbound.empty')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
