import { bodyFromRows, parseTemplateObject, rowsFromBody } from '../utils/curlMapping';
import { SAMPLE_LEAD_PAYLOAD } from '../utils/webhookPreview';

const NULL_OPTION = '__NULL__';
const FIXED_OPTION = '__FIXED__';

function sampleFor(path) {
  const value = path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), SAMPLE_LEAD_PAYLOAD);
  if (value === undefined || value === null || value === '') return 'null';
  return Array.isArray(value) ? value.join(',') : String(value);
}

function displayFixed(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// Numbers/booleans/JSON typed into a fixed value keep their JSON type (the
// client's "LeadSource": 41 must stay a number); anything else is a string.
function parseFixed(text) {
  if (/^(-?\d+(\.\d+)?|true|false|\[.*\]|\{.*\})$/s.test(text.trim())) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

// Per-key mapping editor for a Custom JSON body (section 47): one row per
// key in the client's body, each set to a CRM lead field, a fixed value,
// or null. The body template stays the single source of truth - this table
// reads it and writes it back, so the raw template editor and this view
// never disagree.
export default function FieldMappingTable({ template, groups, onChange }) {
  const body = parseTemplateObject(template);
  if (!body) {
    return <p className="hint">Field mapping is available when the body template is a JSON object. Edit the template directly below.</p>;
  }
  const rows = rowsFromBody(body);
  const known = new Set(groups.flatMap((g) => g.items.map((i) => i.path)));

  const updateRow = (index, patch) => {
    const next = rows.map((r, i) => (i === index ? { path: r.path, ...patch } : r));
    onChange(JSON.stringify(bodyFromRows(body, next), null, 4));
  };

  const onSelect = (index, value) => {
    if (value === NULL_OPTION) updateRow(index, { kind: 'NULL' });
    else if (value === FIXED_OPTION) updateRow(index, { kind: 'FIXED', value: '' });
    else updateRow(index, { kind: 'FIELD', field: value });
  };

  const mappedCount = rows.filter((r) => r.kind === 'FIELD').length;

  return (
    <div className="field">
      <label>Field Mapping - {mappedCount} of {rows.length} client keys mapped to CRM fields</label>
      <div className="mapping-table-wrap">
        <table className="pro-table mapping-table">
          <thead>
            <tr><th>Client CRM key</th><th>Send value from</th><th>Sample result</th></tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const key = row.path.join('.');
              const selectValue = row.kind === 'FIELD' ? row.field : row.kind === 'NULL' ? NULL_OPTION : FIXED_OPTION;
              return (
                <tr key={key} className={row.kind === 'FIELD' ? 'mapped' : ''}>
                  <td className="primary-cell"><code>{key}</code></td>
                  <td>
                    <div className="mapping-cell">
                      <select value={selectValue} onChange={(e) => onSelect(index, e.target.value)}>
                        <option value={NULL_OPTION}>- Not mapped (send null) -</option>
                        <option value={FIXED_OPTION}>Fixed value...</option>
                        {row.kind === 'FIELD' && !known.has(row.field) && <option value={row.field}>{`{{${row.field}}}`} (unknown field)</option>}
                        {groups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.items.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}
                          </optgroup>
                        ))}
                      </select>
                      {row.kind === 'FIXED' && (
                        <input
                          value={displayFixed(row.value)}
                          onChange={(e) => updateRow(index, { kind: 'FIXED', value: parseFixed(e.target.value) })}
                          placeholder="Same value for every lead"
                        />
                      )}
                    </div>
                  </td>
                  <td className="secondary-cell">
                    {row.kind === 'FIELD' ? sampleFor(row.field) : row.kind === 'NULL' ? 'null' : displayFixed(row.value)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
