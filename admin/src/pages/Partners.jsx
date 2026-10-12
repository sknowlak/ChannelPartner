import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createPartner, listFieldDefinitions, listPartners } from '../api/client';
import PartnerForm from '../components/PartnerForm';
import Pagination, { PageSizeSelect } from '../components/Pagination';
import { csvCell } from '../utils/csv';
import { errorMessage } from '../utils/errors';
import { enumLabel } from '../i18n/enumLabels';

const EMPTY_FORM = { customFields: {} };
const initialFilters = { name: '', city: '', status: '', kycStatus: '', createdFrom: '', createdTo: '' };
const KYC_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'];

export default function Partners() {
  const { t } = useTranslation(['partners', 'common', 'enums']);
  const [partners, setPartners] = useState([]);
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const navigate = useNavigate();

  useEffect(() => {
    listFieldDefinitions().then(({ data }) => setFieldDefinitions(data.definitions)).catch(() => {});
  }, []);

  const load = (overrides = {}) => {
    const effective = { ...filters, ...overrides };
    const params = Object.fromEntries(Object.entries(effective).filter(([, v]) => v));
    listPartners(params)
      .then(({ data }) => { setPartners(data.partners); setPage(1); })
      .catch((err) => setError(errorMessage(err)));
  };

  useEffect(load, []);

  const setStatusTab = (status) => {
    setFilters((f) => ({ ...f, status }));
    load({ status });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createPartner(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    // Headers follow the UI language; cell values stay raw (enum values, IDs).
    const header = ['partnerId', 'name', 'status', 'kyc', 'city', 'email'].map((k) => t(`partners:list.csv.${k}`));
    const rows = partners.map((p) => [p.partnerId, p.name, p.status, p.kycStatus, p.city || '', p.email]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'channel-partners.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeCount = partners.filter((p) => p.status === 'ACTIVE').length;
  const inactiveCount = partners.filter((p) => p.status === 'INACTIVE').length;

  const totalPages = Math.max(1, Math.ceil(partners.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedPartners = partners.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="page page-wide">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>{t('partners:list.title')}</h1>
        <button className="pill-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? t('common:actions.cancel') : t('partners:list.newPartner')}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <PartnerForm fieldDefinitions={fieldDefinitions} values={form} onChange={setForm} mode="create" />
          <button className="primary" type="submit" disabled={busy}>{busy ? t('partners:list.creating') : t('partners:list.createPartner')}</button>
        </form>
      )}

      <div className="status-tabs">
        <button className={!filters.status ? 'active' : ''} onClick={() => setStatusTab('')}>
          <span className="dot all" />{t('partners:list.tabs.all', { count: partners.length })}
        </button>
        <button className={filters.status === 'ACTIVE' ? 'active' : ''} onClick={() => setStatusTab('ACTIVE')}>
          <span className="dot active-dot" />{t('partners:list.tabs.active', { count: activeCount })}
        </button>
        <button className={filters.status === 'INACTIVE' ? 'active' : ''} onClick={() => setStatusTab('INACTIVE')}>
          <span className="dot inactive-dot" />{t('partners:list.tabs.inactive', { count: inactiveCount })}
        </button>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <input
            type="text"
            placeholder={t('partners:list.searchPlaceholder')}
            aria-label={t('partners:list.searchPlaceholder')}
            value={filters.name}
            onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
        </div>
        <div className="toolbar-right">
          <input placeholder={t('partners:list.cityPlaceholder')} aria-label={t('partners:list.cityPlaceholder')} value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} style={{ padding: '0.5rem 0.7rem', border: '1px solid #d8dce3', borderRadius: 8 }} />
          <select value={filters.kycStatus} onChange={(e) => setFilters((f) => ({ ...f, kycStatus: e.target.value }))} aria-label={t('partners:list.anyKyc')}>
            <option value="">{t('partners:list.anyKyc')}</option>
            {KYC_STATUSES.map((s) => <option key={s} value={s}>{enumLabel('kycStatus', s)}</option>)}
          </select>
          <label className="hint">{t('common:fields.from')} <input type="date" value={filters.createdFrom} onChange={(e) => setFilters((f) => ({ ...f, createdFrom: e.target.value }))} /></label>
          <label className="hint">{t('common:fields.to')} <input type="date" value={filters.createdTo} onChange={(e) => setFilters((f) => ({ ...f, createdTo: e.target.value }))} /></label>
          <button className="secondary" onClick={() => load()}>{t('common:actions.apply')}</button>
          <button className="pill-export" onClick={exportCsv}>{t('common:actions.export')}</button>
          <PageSizeSelect value={pageSize} onChange={(n) => { setPageSize(n); setPage(1); }} />
        </div>
      </div>

      <div className="card">
        <table className="pro-table">
          <thead>
            <tr>{['partner', 'status', 'kyc', 'city', 'contact'].map((k) => <th key={k}>{t(`partners:list.columns.${k}`)}</th>)}</tr>
          </thead>
          <tbody>
            {pagedPartners.map((p) => (
              <tr key={p.partnerId} className="clickable" onClick={() => navigate(`/partners/${p.partnerId}`)}>
                <td>
                  <div className="primary-cell">{p.name}</div>
                  <div className="secondary-cell">{p.partnerId}</div>
                </td>
                <td><span className={`badge ${p.status.toLowerCase()}`}>{enumLabel('status', p.status)}</span></td>
                <td>{enumLabel('kycStatus', p.kycStatus)}</td>
                <td>{p.city || '-'}</td>
                <td className="secondary-cell">{p.email}</td>
              </tr>
            ))}
            {partners.length === 0 && <tr><td colSpan={5} className="hint">{t('partners:list.empty')}</td></tr>}
          </tbody>
        </table>

        {partners.length > 0 && (
          <Pagination currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} total={partners.length} setPage={setPage} />
        )}
      </div>
    </div>
  );
}
