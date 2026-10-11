import { useState } from 'react';
import { sortLeadTabs } from '../utils/leadTabs';

// Chooses which lead fields the status-update form shows for a status or
// sub-status, and whether each is mandatory (section 49). Offers every
// ENABLED field of the lead module, grouped like the Add Lead tabs.
// `value` = [{ fieldKey, isRequired }].
export default function StatusFieldsPicker({ fieldDefs, value, onChange, disabled }) {
  const [query, setQuery] = useState('');
  const selected = new Map((value || []).map((f) => [f.fieldKey, f]));
  const q = query.trim().toLowerCase();
  const visible = fieldDefs.filter((d) => !q || d.label.toLowerCase().includes(q) || d.fieldKey.toLowerCase().includes(q));
  const groups = sortLeadTabs([...new Set(visible.map((d) => d.group))]);

  const setField = (fieldKey, patch) => {
    const current = selected.get(fieldKey);
    let next;
    if (patch === null) next = (value || []).filter((f) => f.fieldKey !== fieldKey);
    else if (current) next = (value || []).map((f) => (f.fieldKey === fieldKey ? { ...f, ...patch } : f));
    else next = [...(value || []), { fieldKey, isRequired: false, ...patch }];
    onChange(next);
  };

  return (
    <div className="fields-picker">
      <div className="fields-picker-head">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search lead fields..." />
        <span className="hint">{selected.size} shown · {[...selected.values()].filter((f) => f.isRequired).length} mandatory</span>
      </div>
      <div className="fields-picker-list">
        {groups.map((group) => (
          <div key={group}>
            <div className="placeholder-group-label">{group}</div>
            {visible.filter((d) => d.group === group).map((def) => {
              const sel = selected.get(def.fieldKey);
              return (
                <div key={def.fieldKey} className={`fields-picker-row ${sel ? 'on' : ''}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!sel}
                      disabled={disabled}
                      onChange={(e) => setField(def.fieldKey, e.target.checked ? {} : null)}
                    />
                    {def.label}
                  </label>
                  <label className={`mandatory-toggle ${sel ? '' : 'muted'}`}>
                    <input
                      type="checkbox"
                      checked={!!sel?.isRequired}
                      disabled={disabled || !sel}
                      onChange={(e) => setField(def.fieldKey, { isRequired: e.target.checked })}
                    />
                    Mandatory
                  </label>
                </div>
              );
            })}
          </div>
        ))}
        {visible.length === 0 && <p className="hint">No fields match.</p>}
      </div>
    </div>
  );
}
