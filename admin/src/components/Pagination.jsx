import { useTranslation } from 'react-i18next';

// Shared pager for the Partners and Registrations tables (same markup both
// used inline before). Page-size picker and the "Showing x - y of z" line.
export function PageSizeSelect({ value, onChange }) {
  const { t } = useTranslation('lists');
  return (
    <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      {t('lists:pageSize')}
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}

export default function Pagination({ currentPage, totalPages, pageSize, total, setPage }) {
  const { t } = useTranslation('lists');
  return (
    <div className="pagination-bar">
      <span className="hint">
        {t('lists:showing', { from: (currentPage - 1) * pageSize + 1, to: Math.min(currentPage * pageSize, total), total })}
      </span>
      <div className="pagination-buttons" role="navigation" aria-label={t('lists:pagination.label')}>
        <button className="page-btn" aria-label={t('lists:pagination.first')} disabled={currentPage <= 1} onClick={() => setPage(1)}>&laquo;</button>
        <button className="page-btn" aria-label={t('lists:pagination.previous')} disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>&lsaquo;</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            className={`page-btn ${p === currentPage ? 'current' : ''}`}
            aria-label={t('lists:pagination.page', { page: p })}
            aria-current={p === currentPage ? 'page' : undefined}
            onClick={() => setPage(p)}
          >
            {p}
          </button>
        ))}
        <button className="page-btn" aria-label={t('lists:pagination.next')} disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>&rsaquo;</button>
        <button className="page-btn" aria-label={t('lists:pagination.last')} disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>&raquo;</button>
      </div>
    </div>
  );
}
