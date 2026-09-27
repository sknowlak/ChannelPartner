// Every grid filter EXCEPT the name/mobile/registration-ID search box (which
// stays its own always-visible field in the toolbar) lives behind this one
// "Filter" button instead of a row of selects that used to spill onto a
// second toolbar line as more SELECT-type lead fields were added.
export default function FilterPanel({
  availableProjects, projectId, onProjectChange,
  selectFieldDefs, fieldFilters, onFieldFilterChange,
  onClear, onClose
}) {
  return (
    <div className="column-panel card">
      <div className="column-panel-header">
        <strong>Filters</strong>
        <button className="link" onClick={onClose}>Close</button>
      </div>
      <div className="column-panel-list filter-panel-fields">
        <div className="field">
          <label>Project</label>
          <select value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
            <option value="">All projects</option>
            {availableProjects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {selectFieldDefs.map((def) => (
          <div className="field" key={def.fieldKey}>
            <label>{def.label}</label>
            <select value={fieldFilters[def.fieldKey] || ''} onChange={(e) => onFieldFilterChange(def.fieldKey, e.target.value)}>
              <option value="">Any</option>
              {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
        {selectFieldDefs.length === 0 && (
          <p className="hint" style={{ margin: 0 }}>No other filterable fields are enabled yet (Settings &gt; Lead).</p>
        )}
      </div>
      <div className="column-panel-footer">
        <button className="secondary" onClick={onClear}>Clear All</button>
      </div>
    </div>
  );
}
