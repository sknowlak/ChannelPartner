import { useTranslation } from 'react-i18next';
import { useDataLabels } from '../i18n/dataLabels';

// Every grid filter EXCEPT the name/mobile/registration-ID search box (which
// stays its own always-visible field in the toolbar) lives behind this one
// "Filter" button instead of a row of selects that used to spill onto a
// second toolbar line as more SELECT-type lead fields were added.
export default function FilterPanel({
  availableProjects, projectId, onProjectChange,
  selectFieldDefs, fieldFilters, onFieldFilterChange,
  onClear, onClose
}) {
  const { t } = useTranslation(['leads', 'common']);
  const { fieldLabel, optionLabel } = useDataLabels();
  return (
    <div className="column-panel card">
      <div className="column-panel-header">
        <strong>{t('leads:filters.title')}</strong>
        <button className="link" onClick={onClose}>{t('common:actions.close')}</button>
      </div>
      <div className="column-panel-list filter-panel-fields">
        <div className="field">
          <label>{t('common:fields.project')}</label>
          <select value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
            <option value="">{t('leads:filters.allProjects')}</option>
            {availableProjects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {selectFieldDefs.map((def) => (
          <div className="field" key={def.fieldKey}>
            <label>{fieldLabel(def)}</label>
            <select value={fieldFilters[def.fieldKey] || ''} onChange={(e) => onFieldFilterChange(def.fieldKey, e.target.value)}>
              <option value="">{t('leads:filters.any')}</option>
              {def.options.map((o) => <option key={o} value={o}>{optionLabel(o)}</option>)}
            </select>
          </div>
        ))}
        {selectFieldDefs.length === 0 && (
          <p className="hint" style={{ margin: 0 }}>{t('leads:filters.noFields')}</p>
        )}
      </div>
      <div className="column-panel-footer">
        <button className="secondary" onClick={onClear}>{t('leads:filters.clearAll')}</button>
      </div>
    </div>
  );
}
