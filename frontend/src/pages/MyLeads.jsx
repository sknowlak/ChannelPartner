import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { assignRegistration, listLeadFields, listMyRegistrations } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime } from '../utils/timezone';
import { formatCurrency } from '../utils/currency';
import { PERMISSIONS } from '../utils/permissions';
import SortableTh from '../components/SortableTh';
import ManageColumnsPanel from '../components/ManageColumnsPanel';
import FilterPanel from '../components/FilterPanel';
import LeadHistoryModal from '../components/LeadHistoryModal';
import LeadPreviewDrawer from '../components/LeadPreviewDrawer';
import { AssignSelect, useLeadWorkflowOptions } from '../components/LeadQuickUpdate';
import { applySort, nextSortDir } from '../utils/sort';
import { loadColumnPrefs, saveColumnPrefs } from '../utils/columnPrefs';
import { sortLeadTabs } from '../utils/leadTabs';
import { csvCell } from '../utils/csv';
import { formatNumber } from '../i18n/format';
import { fieldLabel, optionLabel, statusLabel, subStatusLabel } from '../i18n/dataLabels';

const initialFilters = { search: '', status: '', projectId: '' };
const GRID_KEY = 'myLeads';
// Lean, out-of-the-box column set (section 40 update) - everything else the
// partner has enabled is still there, just starts hidden until they add it
// back from Manage Columns, so a first-time grid isn't a wall of "-" for
// fields nobody's filled in yet.
const DEFAULT_VISIBLE_KEYS = ['name', 'mobile', 'stage', 'leadSource', 'assignedTo'];

function fieldValue(registration, def) {
  if (def.scope === 'customer') {
    if (registration.customer) return registration.customer[def.fieldKey];
    if (def.fieldKey === 'name') return registration.customerName;
    if (def.fieldKey === 'mobile') return registration.customerMobile;
    return undefined;
  }
  if (def.scope === 'custom') return registration.customFields?.[def.fieldKey];
  return registration[def.fieldKey];
}

// What the grid shows: numbers/currency in the UI locale, default dropdown
// options translated (display only).
function formatFieldValue(def, value, currency) {
  if (value === undefined || value === null || value === '') return '-';
  if (def.dataType === 'LIST') return Array.isArray(value) ? value.map((v) => optionLabel(v)).join(', ') : String(optionLabel(value));
  if (def.dataType === 'CURRENCY') return formatCurrency(value, currency);
  if (def.dataType === 'NUMBER') return formatNumber(value);
  if (def.dataType === 'SELECT') return String(optionLabel(value));
  return String(value);
}

// What the CSV export writes: the stored value, untranslated and unformatted
// by locale, so the file reads the same whatever language exported it.
function rawFieldValue(def, value) {
  if (value === undefined || value === null || value === '') return '-';
  if (def.dataType === 'LIST' && Array.isArray(value)) return value.join(', ');
  return String(value);
}

function ViewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PreviewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M4 4h16v16H4V4ZM14 4v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M3 5h18v14H3V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m3 6 9 7 9-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M20 12a8 8 0 1 1-3.8-6.8L20 4l-1.1 3.9A8 8 0 0 1 20 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 9.5c.3 2.6 2.4 4.7 5 5 .7.1 1.1-.7.6-1.2l-1-1a.7.7 0 0 0-.8-.1l-.4.2a4.5 4.5 0 0 1-2.3-2.3l.2-.4a.7.7 0 0 0-.1-.8l-1-1c-.5-.5-1.3-.1-1.2.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.9 21 3 13.1 3 3.6c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1L6.6 10.8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8M3 12a9 9 0 0 0 15.4 6.4L21 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 4v4h-4M3 20v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const AVATAR_PALETTE =['#5b3df5', '#12b8a3', '#e2504a', '#b57b2e', '#2f6fed', '#17a2c9', '#8a6d00'];
function avatarColorFor(name) {
  const code = (name || '?').trim().charCodeAt(0) || 0;
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length];
}

// Every lead field the partner has enabled (section 39) becomes its own
// manageable grid column, plus three system columns that aren't part of the
// LeadFieldDefinition catalogue (Stage, Booked, Protection Until) - section
// 40, "manage leads page also show all column and give option to manage
// column and swapping". Column order/visibility is a personal display
// preference (utils/columnPrefs.js), not organisation data.
function customerMobile(r) {
  return r.customer?.mobile || r.customerMobile || '';
}

// The API returns field definitions sorted alphabetically by group name,
// which buries Lead Info (name, mobile - what you actually look for first)
// behind "Additional Info" and "Enquiry Info". The default column order
// instead follows the same Lead Info -> Enquiry Info -> Additional Info ->
// Others -> Notes sequence Add/Edit Lead's tabs already use, so name/mobile
// are the first columns a partner sees.
function sortFieldDefsForGrid(defs) {
  const groupOrder = sortLeadTabs([...new Set(defs.map((d) => d.group))]);
  const rank = new Map(groupOrder.map((g, i) => [g, i]));
  return [...defs].sort((a, b) => rank.get(a.group) - rank.get(b.group));
}

// Each column: `label` (translated header), `render` (cell), `title` (cell
// tooltip, display text) and `text` (raw value for the CSV export).
function buildColumns(fieldDefs, partnerTimezone, currency, users, canAssign, onAssign, t) {
  const fieldColumns = fieldDefs.map((def) => {
    // The lead's name is the row's primary identity, so it gets the same
    // avatar-circle + name/mobile treatment a CRM lead grid uses everywhere -
    // every other field stays a plain formatted cell.
    if (def.scope === 'customer' && def.fieldKey === 'name') {
      return {
        key: def.fieldKey,
        label: fieldLabel(def),
        sortValue: (r) => fieldValue(r, def),
        render: (r) => {
          const name = fieldValue(r, def) || '-';
          return (
            <div className="name-cell">
              <span className="avatar-circle" style={{ background: avatarColorFor(name) }}>{String(name).charAt(0)}</span>
              <span className="name-lines">
                <span className="primary-cell">{name}</span>
                <span className="secondary-cell">{customerMobile(r) || '-'}</span>
              </span>
            </div>
          );
        },
        title: (r) => formatFieldValue(def, fieldValue(r, def), currency),
        text: (r) => rawFieldValue(def, fieldValue(r, def))
      };
    }
    return {
      key: def.fieldKey,
      label: fieldLabel(def),
      sortValue: (r) => fieldValue(r, def),
      render: (r) => formatFieldValue(def, fieldValue(r, def), currency),
      title: (r) => formatFieldValue(def, fieldValue(r, def), currency),
      text: (r) => rawFieldValue(def, fieldValue(r, def))
    };
  });

  const systemColumns = [
    {
      key: 'stage',
      label: t('leads:columns.status'),
      sortValue: (r) => `${r.currentStage} ${r.subStatus || ''}`,
      render: (r) => (
        <span>
          {statusLabel(r.currentStage)}
          {r.subStatus && <span className="sub-status">{subStatusLabel(r.subStatus)}</span>}
          {r.scheduledAt && <span className="sub-status">🕒 {formatDateTime(r.scheduledAt, partnerTimezone)}</span>}
        </span>
      ),
      title: (r) => (r.subStatus ? `${statusLabel(r.currentStage)} - ${subStatusLabel(r.subStatus)}` : statusLabel(r.currentStage)),
      text: (r) => (r.subStatus ? `${r.currentStage} - ${r.subStatus}` : r.currentStage)
    },
    {
      key: 'assignedTo',
      label: t('leads:columns.assignTo'),
      sortValue: (r) => r.assignedToName || '',
      render: (r) => (
        <AssignSelect
          users={users}
          value={r.assignedTo}
          disabled={!canAssign}
          onChange={(userId) => onAssign(r.registrationId, userId)}
          style={{ padding: '0.35rem 0.5rem', fontSize: '0.82rem', minWidth: '9rem' }}
        />
      ),
      title: (r) => r.assignedToName || t('leads:assign.unassigned'),
      text: (r) => r.assignedToName || 'Unassigned'
    },
    {
      key: 'booked',
      label: t('leads:columns.booked'),
      sortValue: (r) => (r.isBooked ? 1 : 0),
      render: (r) => <span className={`badge ${r.isBooked ? 'accepted' : 'pending'}`}>{r.isBooked ? t('leads:booking.booked') : t('leads:booking.pending')}</span>,
      title: (r) => (r.isBooked ? t('leads:booking.booked') : t('leads:booking.pending')),
      text: (r) => (r.isBooked ? 'Yes' : 'No')
    },
    {
      key: 'protection',
      label: t('leads:columns.protectionUntil'),
      sortValue: (r) => new Date(r.protectionExpiry).getTime(),
      render: (r) => formatDate(r.protectionExpiry, partnerTimezone),
      title: (r) => formatDate(r.protectionExpiry, partnerTimezone),
      text: (r) => formatDate(r.protectionExpiry, partnerTimezone)
    }
  ];

  return [...fieldColumns, ...systemColumns];
}

function buildDefaultColumnState(fieldDefs) {
  const order = [...fieldDefs.map((d) => d.fieldKey), 'stage', 'assignedTo', 'booked', 'protection'];
  const hidden = order.filter((k) => !DEFAULT_VISIBLE_KEYS.includes(k));
  return { order, hidden };
}

export default function MyLeads() {
  const { t, i18n } = useTranslation(['leads', 'common', 'data']);
  const [registrations, setRegistrations] = useState(null);
  const [fieldDefs, setFieldDefs] = useState([]);
  const [fieldFilters, setFieldFilters] = useState({});
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState({ key: null, dir: null });
  const [columnPrefs, setColumnPrefs] = useState(null);
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);
  const [previewFor, setPreviewFor] = useState(null);
  const workflowOptions = useLeadWorkflowOptions();
  const [refreshing, setRefreshing] = useState(false);
  const { partner, hasPermission } = useAuth();
  const navigate = useNavigate();
  const canAssign = hasPermission(PERMISSIONS.MANAGE_LEADS);

  const toggleSort = (key) => setSort((s) => {
    if (s.key !== key) return { key, dir: 'asc' };
    const dir = nextSortDir(s.dir);
    return dir ? { key, dir } : { key: null, dir: null };
  });

  const refresh = () => {
    setRefreshing(true);
    return listMyRegistrations()
      .then(({ data }) => setRegistrations(data.registrations))
      .catch((err) => setError(err.response?.data?.reason || err.message))
      .finally(() => setRefreshing(false));
  };

  const handleAssign = async (registrationId, memberId) => {
    try {
      const { data } = await assignRegistration(registrationId, memberId);
      setRegistrations((regs) => regs.map((r) => (
        r.registrationId === registrationId ? { ...r, assignedTo: data.assignedTo, assignedToName: data.assignedToName } : r
      )));
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  };

  // Keeps the grid row in step with whatever the Lead Preview drawer saved.
  const handlePreviewUpdate = (registrationId, patch, { fieldsChanged } = {}) => {
    setRegistrations((regs) => regs.map((r) => (r.registrationId === registrationId ? { ...r, ...patch } : r)));
    if (fieldsChanged) refresh();
  };

  useEffect(() => {
    Promise.all([listMyRegistrations(), listLeadFields()])
      .then(async ([{ data }, { data: fieldData }]) => {
        setRegistrations(data.registrations);
        const enabled = sortFieldDefsForGrid(fieldData.definitions.filter((d) => d.isEnabled));
        setFieldDefs(enabled);
        const { order, hidden } = buildDefaultColumnState(enabled);
        setColumnPrefs(await loadColumnPrefs(GRID_KEY, order, hidden));
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allColumns = useMemo(
    () => buildColumns(fieldDefs, partner.timezone, partner.currency, workflowOptions.users, canAssign, handleAssign, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fieldDefs, partner.timezone, partner.currency, workflowOptions.users, canAssign, i18n.language]
  );
  const columnByKey = useMemo(() => new Map(allColumns.map((c) => [c.key, c])), [allColumns]);
  const selectFieldDefs = useMemo(() => fieldDefs.filter((d) => d.dataType === 'SELECT'), [fieldDefs]);

  const updateColumnPrefs = (order, hidden) => {
    const next = { order, hidden };
    setColumnPrefs(next);
    saveColumnPrefs(GRID_KEY, next);
  };

  const resetColumnPrefs = () => {
    const { order, hidden } = buildDefaultColumnState(fieldDefs);
    updateColumnPrefs(order, hidden);
  };

  const visibleColumns = columnPrefs
    ? columnPrefs.order.filter((k) => !columnPrefs.hidden.includes(k)).map((k) => columnByKey.get(k)).filter(Boolean)
    : [];

  const bookedCount = (registrations || []).filter((r) => r.isBooked).length;
  const pendingCount = (registrations || []).filter((r) => !r.isBooked).length;
  const availableProjects = registrations ? [...new Set(registrations.map((r) => r.projectId).filter(Boolean))].sort() : [];
  const activeFilterCount = (filters.projectId ? 1 : 0) + Object.values(fieldFilters).filter(Boolean).length;
  const clearAllFilters = () => {
    setFilters((f) => ({ ...f, projectId: '' }));
    setFieldFilters({});
    setPage(1);
  };

  const filteredRegistrations = (registrations || []).filter((r) => {
    const search = filters.search.trim().toLowerCase();
    if (search && !r.customerName.toLowerCase().includes(search) && !r.customerMobile.includes(search) && !r.registrationId.toLowerCase().includes(search)) return false;
    if (filters.status === 'BOOKED' && !r.isBooked) return false;
    if (filters.status === 'PENDING' && r.isBooked) return false;
    if (filters.projectId && r.projectId !== filters.projectId) return false;
    for (const def of selectFieldDefs) {
      const selected = fieldFilters[def.fieldKey];
      if (selected && fieldValue(r, def) !== selected) return false;
    }
    return true;
  });

  const sortAccessors = useMemo(() => {
    const map = {};
    for (const col of allColumns) map[col.key] = col.sortValue;
    return map;
  }, [allColumns]);

  const sortedRegistrations = applySort(filteredRegistrations, sort, sortAccessors);
  const totalPages = Math.max(1, Math.ceil(sortedRegistrations.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRegistrations = sortedRegistrations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const setStatusTab = (status) => {
    setFilters((f) => ({ ...f, status }));
    setPage(1);
  };

  const exportCsv = () => {
    // Headers in the UI language; cell values raw (see rawFieldValue).
    const header = [t('leads:list.registrationId'), ...visibleColumns.map((c) => c.label)];
    const rows = sortedRegistrations.map((r) => [r.registrationId, ...visibleColumns.map((c) => c.text(r))]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page page-wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>{t('leads:list.title')}</h1>
          <p className="hint" style={{ margin: 0 }}>{t('leads:list.signedInAs', { name: partner.name, partnerId: partner.partnerId, timezone: partner.timezone })}</p>
        </div>
        <button className="pill-primary" onClick={() => navigate('/register-lead')}>{t('leads:list.addLead')}</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {registrations && (
        <div className="status-tabs">
          <button className={!filters.status ? 'active' : ''} onClick={() => setStatusTab('')}>
            <span className="dot all" />{t('leads:list.tabs.all', { count: registrations.length })}
          </button>
          <button className={filters.status === 'PENDING' ? 'active' : ''} onClick={() => setStatusTab('PENDING')}>
            <span className="dot active-dot" />{t('leads:list.tabs.pending', { count: pendingCount })}
          </button>
          <button className={filters.status === 'BOOKED' ? 'active' : ''} onClick={() => setStatusTab('BOOKED')}>
            <span className="dot inactive-dot" />{t('leads:list.tabs.booked', { count: bookedCount })}
          </button>
        </div>
      )}

      {registrations && registrations.length > 0 && (
        <div className="toolbar">
          <div className="toolbar-left">
            <input
              type="text"
              placeholder={t('leads:list.searchPlaceholder')}
              value={filters.search}
              onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPage(1); }}
            />
          </div>
          <div className="toolbar-right">
            <button className="pill-export" onClick={exportCsv}>{t('common:actions.export')}</button>
            <button className="icon-btn view" title={t('common:actions.refresh')} disabled={refreshing} onClick={refresh} style={{ margin: 0 }}>
              <RefreshIcon />
            </button>
            <div className="column-panel-anchor">
              <button className="pill-filter" onClick={() => setShowFilterPanel((s) => !s)}>
                {t('common:actions.filter')} {activeFilterCount > 0 && <span className="filter-count-badge">{activeFilterCount}</span>}
              </button>
              {showFilterPanel && (
                <FilterPanel
                  availableProjects={availableProjects}
                  projectId={filters.projectId}
                  onProjectChange={(v) => { setFilters((f) => ({ ...f, projectId: v })); setPage(1); }}
                  selectFieldDefs={selectFieldDefs}
                  fieldFilters={fieldFilters}
                  onFieldFilterChange={(key, v) => { setFieldFilters((f) => ({ ...f, [key]: v })); setPage(1); }}
                  onClear={clearAllFilters}
                  onClose={() => setShowFilterPanel(false)}
                />
              )}
            </div>
            <div className="column-panel-anchor">
              <button className="secondary" onClick={() => setShowColumnPanel((s) => !s)}>{t('leads:list.manageColumns')}</button>
              {showColumnPanel && columnPrefs && (
                <ManageColumnsPanel
                  columns={columnPrefs.order.map((k) => columnByKey.get(k)).filter(Boolean)}
                  hidden={columnPrefs.hidden}
                  onChange={updateColumnPrefs}
                  onReset={resetColumnPrefs}
                  onClose={() => setShowColumnPanel(false)}
                />
              )}
            </div>
            <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {t('leads:list.rowsPerPage')}
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                {[10, 25, 50].map((n) => <option key={n} value={n}>{formatNumber(n)}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-scroll">
          <table className="pro-table">
            <thead>
              <tr>
                <th>{t('leads:list.registrationId')}</th>
                {visibleColumns.map((col) => (
                  <SortableTh key={col.key} label={col.label} colKey={col.key} sort={sort} onSort={toggleSort} />
                ))}
                <th>{t('common:fields.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pagedRegistrations.map((r) => (
                <tr key={r.registrationId}>
                  <td className="secondary-cell">{r.registrationId}</td>
                  {visibleColumns.map((col) => (
                    <td key={col.key} title={col.title(r)}>{col.render(r)}</td>
                  ))}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="icon-btn preview" title={t('leads:list.actions.preview')} onClick={() => setPreviewFor(r.registrationId)}><PreviewIcon /></button>
                    <button className="icon-btn view" title={t('common:actions.view')} onClick={() => navigate(`/registrations/${r.registrationId}`)}><ViewIcon /></button>
                    <button className="icon-btn edit" title={t('common:actions.edit')} onClick={() => navigate(`/registrations/${r.registrationId}/edit`)}><EditIcon /></button>
                    <button className="icon-btn history" title={t('leads:list.actions.history')} onClick={() => setHistoryFor(r.registrationId)}><HistoryIcon /></button>
                    <button
                      className="icon-btn mail" title={t('leads:list.actions.email')}
                      disabled={!r.customer?.email}
                      onClick={() => { window.location.href = `mailto:${r.customer.email}`; }}
                    ><MailIcon /></button>
                    <button
                      className="icon-btn whatsapp" title={t('leads:list.actions.whatsapp')}
                      disabled={!customerMobile(r)}
                      onClick={() => window.open(`https://wa.me/${customerMobile(r).replace(/\D/g, '')}`, '_blank', 'noopener')}
                    ><WhatsAppIcon /></button>
                    <button
                      className="icon-btn call" title={t('leads:list.actions.call')}
                      disabled={!customerMobile(r)}
                      onClick={() => { window.location.href = `tel:${customerMobile(r)}`; }}
                    ><CallIcon /></button>
                  </td>
                </tr>
              ))}
              {registrations && registrations.length === 0 && (
                <tr><td colSpan={visibleColumns.length + 2} className="hint">{t('leads:list.emptyState')}</td></tr>
              )}
              {registrations && registrations.length > 0 && filteredRegistrations.length === 0 && (
                <tr><td colSpan={visibleColumns.length + 2} className="hint">{t('leads:list.noMatch')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!registrations && !error && <p className="hint">{t('common:states.loading')}</p>}

        {filteredRegistrations.length > 0 && (
          <div className="pagination-bar">
            <span className="hint">
              {t('leads:list.showing', {
                from: formatNumber((currentPage - 1) * pageSize + 1),
                to: formatNumber(Math.min(currentPage * pageSize, filteredRegistrations.length)),
                total: formatNumber(filteredRegistrations.length)
              })}
            </span>
            <div className="pagination-buttons">
              <button className="page-btn" disabled={currentPage <= 1} aria-label={t('leads:list.pagination.first')} onClick={() => setPage(1)}>&laquo;</button>
              <button className="page-btn" disabled={currentPage <= 1} aria-label={t('leads:list.pagination.previous')} onClick={() => setPage((p) => p - 1)}>&lsaquo;</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button key={p} className={`page-btn ${p === currentPage ? 'current' : ''}`} onClick={() => setPage(p)}>{formatNumber(p)}</button>
              ))}
              <button className="page-btn" disabled={currentPage >= totalPages} aria-label={t('leads:list.pagination.next')} onClick={() => setPage((p) => p + 1)}>&rsaquo;</button>
              <button className="page-btn" disabled={currentPage >= totalPages} aria-label={t('leads:list.pagination.last')} onClick={() => setPage(totalPages)}>&raquo;</button>
            </div>
          </div>
        )}
      </div>

      {previewFor && (
        <LeadPreviewDrawer
          registrationId={previewFor}
          timezone={partner.timezone}
          options={workflowOptions}
          canEdit={canAssign}
          onClose={() => setPreviewFor(null)}
          onUpdated={handlePreviewUpdate}
          onShowHistory={(id) => setHistoryFor(id)}
        />
      )}

      {historyFor && (
        <LeadHistoryModal registrationId={historyFor} timezone={partner.timezone} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  );
}
