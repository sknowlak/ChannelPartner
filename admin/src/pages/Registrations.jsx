import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listRegistrations } from '../api/client';
import { csvCell } from '../utils/csv';
import { errorMessage } from '../utils/errors';
import { enumLabel } from '../i18n/enumLabels';
import Pagination, { PageSizeSelect } from '../components/Pagination';

const initialFilters = { partnerId: '', projectId: '', status: '', isBooked: '' };
const REGISTRATION_STATUSES = ['ACCEPTED', 'REJECTED'];

export default function Registrations() {
  const { t } = useTranslation(['registrations', 'common', 'enums']);
  const [registrations, setRegistrations] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const navigate = useNavigate();

  const load = (overrides = {}) => {
    const effective = { ...filters, ...overrides };
    const params = Object.fromEntries(Object.entries(effective).filter(([, v]) => v));
    listRegistrations(params)
      .then(({ data }) => { setRegistrations(data.registrations); setPage(1); })
      .catch((err) => setError(errorMessage(err)));
  };

  useEffect(load, []);

  const setBookedTab = (isBooked) => {
    setFilters((f) => ({ ...f, isBooked }));
    load({ isBooked });
  };

  const exportCsv = () => {
    // Headers follow the UI language; cell values stay raw (Yes/No, enum values) for spreadsheets.
    const header = ['registrationId', 'partner', 'project', 'status', 'stage', 'booked'].map((k) => t(`registrations:list.csv.${k}`));
    const rows = registrations.map((r) => [r.registrationId, r.partnerId, r.projectId, r.status, r.currentStage, r.isBooked ? 'Yes' : 'No']);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'registrations.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const bookedCount = registrations.filter((r) => r.isBooked).length;
  const pendingCount = registrations.filter((r) => !r.isBooked).length;

  const totalPages = Math.max(1, Math.ceil(registrations.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRegistrations = registrations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="page page-wide">
      <h1>{t('registrations:list.title')}</h1>
      {error && <div className="error-box">{error}</div>}

      <div className="status-tabs">
        <button className={filters.isBooked === '' ? 'active' : ''} onClick={() => setBookedTab('')}>
          <span className="dot all" />{t('registrations:list.tabs.all', { count: registrations.length })}
        </button>
        <button className={filters.isBooked === 'false' ? 'active' : ''} onClick={() => setBookedTab('false')}>
          <span className="dot active-dot" />{t('registrations:list.tabs.pending', { count: pendingCount })}
        </button>
        <button className={filters.isBooked === 'true' ? 'active' : ''} onClick={() => setBookedTab('true')}>
          <span className="dot inactive-dot" />{t('registrations:list.tabs.booked', { count: bookedCount })}
        </button>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <input
            type="text"
            placeholder={t('registrations:list.searchPlaceholder')}
            aria-label={t('registrations:list.searchPlaceholder')}
            value={filters.partnerId}
            onChange={(e) => setFilters((f) => ({ ...f, partnerId: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
        </div>
        <div className="toolbar-right">
          <input placeholder={t('registrations:list.projectPlaceholder')} aria-label={t('registrations:list.projectPlaceholder')} value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))} style={{ padding: '0.5rem 0.7rem', border: '1px solid #d8dce3', borderRadius: 8 }} />
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} aria-label={t('registrations:list.anyStatus')}>
            <option value="">{t('registrations:list.anyStatus')}</option>
            {REGISTRATION_STATUSES.map((s) => <option key={s} value={s}>{enumLabel('registrationStatus', s)}</option>)}
          </select>
          <button className="secondary" onClick={() => load()}>{t('common:actions.apply')}</button>
          <button className="pill-export" onClick={exportCsv}>{t('common:actions.export')}</button>
          <PageSizeSelect value={pageSize} onChange={(n) => { setPageSize(n); setPage(1); }} />
        </div>
      </div>

      <div className="card">
        <table className="pro-table">
          <thead>
            <tr>{['registration', 'partner', 'project', 'status', 'stage', 'booked'].map((k) => <th key={k}>{t(`registrations:list.columns.${k}`)}</th>)}</tr>
          </thead>
          <tbody>
            {pagedRegistrations.map((r) => (
              <tr key={r.registrationId} className="clickable" onClick={() => navigate(`/registrations/${r.registrationId}`)}>
                <td className="primary-cell">{r.registrationId}</td>
                <td>{r.partnerId}</td>
                <td>{r.projectId || '-'}</td>
                <td><span className={`badge ${r.status.toLowerCase()}`}>{enumLabel('registrationStatus', r.status)}</span></td>
                <td>{r.currentStage}</td>
                <td><span className={`badge ${r.isBooked ? 'accepted' : 'pending'}`}>{r.isBooked ? t('registrations:list.booked') : t('registrations:list.pending')}</span></td>
              </tr>
            ))}
            {registrations.length === 0 && <tr><td colSpan={6} className="hint">{t('registrations:list.empty')}</td></tr>}
          </tbody>
        </table>

        {registrations.length > 0 && (
          <Pagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} total={registrations.length} setPage={setPage} />
        )}
      </div>
    </div>
  );
}
