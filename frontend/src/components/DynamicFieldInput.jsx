import { COMMON_TIMEZONES } from '../utils/timezone';
import PhoneInput from './PhoneInput';
import ProjectSelect from './ProjectSelect';

// Renders a single form control from a LeadFieldDefinition/UserFieldDefinition
// (sections 36, 38) - shared by RegisterLead.jsx and the team member forms so
// each form always matches whatever fields the partner has configured,
// without per-field code. `currency` is only used by the CURRENCY branch.
export default function DynamicFieldInput({ def, value, onChange, currency }) {
  const v = value ?? '';

  if (def.fieldKey === 'mobile' || def.fieldKey === 'alternateMobile') {
    return <PhoneInput value={v} onChange={onChange} required={def.isRequired} />;
  }

  if (def.fieldKey === 'projectId') {
    return <ProjectSelect value={v} onChange={onChange} required={def.isRequired} />;
  }

  if (def.fieldKey === 'timezone') {
    return (
      <select value={v || 'UTC'} onChange={(e) => onChange(e.target.value)} required={def.isRequired}>
        {(COMMON_TIMEZONES.includes(v) ? COMMON_TIMEZONES : [v || 'UTC', ...COMMON_TIMEZONES]).map((tz) => (
          <option key={tz} value={tz}>{tz}</option>
        ))}
      </select>
    );
  }

  if (def.fieldKey === 'password') {
    return (
      <input
        type="password"
        value={v}
        onChange={(e) => onChange(e.target.value)}
        required={def.isRequired}
        minLength={def.isRequired ? 8 : undefined}
      />
    );
  }

  if (def.dataType === 'SELECT') {
    return (
      <select value={v} onChange={(e) => onChange(e.target.value)} required={def.isRequired}>
        <option value="">Select...</option>
        {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  if (def.dataType === 'CURRENCY') {
    return (
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <span className="hint" style={{ fontFamily: 'monospace' }}>{currency || 'USD'}</span>
        <input
          type="number"
          min="0"
          value={v}
          onChange={(e) => onChange(e.target.value)}
          required={def.isRequired}
          style={{ flex: 1 }}
        />
      </div>
    );
  }

  if (def.dataType === 'NUMBER') {
    return (
      <input
        type="number"
        min="0"
        value={v}
        onChange={(e) => onChange(e.target.value)}
        required={def.isRequired}
      />
    );
  }

  if (def.dataType === 'DATE') {
    return <input type="date" value={v ? String(v).slice(0, 10) : ''} onChange={(e) => onChange(e.target.value)} required={def.isRequired} />;
  }

  if (def.dataType === 'TEXTAREA') {
    return <textarea rows={4} value={v} onChange={(e) => onChange(e.target.value)} required={def.isRequired} />;
  }

  if (def.dataType === 'LIST') {
    const text = Array.isArray(v) ? v.join(', ') : v;
    return (
      <input
        type="text"
        placeholder="Comma separated"
        value={text}
        onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
      />
    );
  }

  return (
    <input
      type={def.fieldKey === 'email' ? 'email' : 'text'}
      value={v}
      onChange={(e) => onChange(e.target.value)}
      required={def.isRequired}
    />
  );
}
