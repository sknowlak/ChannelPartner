import { useTranslation } from 'react-i18next';
import { useDataLabels } from '../i18n/dataLabels';
import PhoneInput from './PhoneInput';
import ProjectSelect from './ProjectSelect';
import PasswordInput from './PasswordInput';
import TimezoneSelect from './TimezoneSelect';

// Renders a single form control from a LeadFieldDefinition/UserFieldDefinition
// (sections 36, 38) - shared by RegisterLead.jsx and the team member forms so
// each form always matches whatever fields the partner has configured,
// without per-field code. `currency` is only used by the CURRENCY branch.
export default function DynamicFieldInput({ def, value, onChange, currency }) {
  const { t } = useTranslation('leads');
  const { optionLabel } = useDataLabels();
  const v = value ?? '';

  if (def.fieldKey === 'mobile' || def.fieldKey === 'alternateMobile') {
    return <PhoneInput value={v} onChange={onChange} required={def.isRequired} />;
  }

  if (def.fieldKey === 'projectId') {
    return <ProjectSelect value={v} onChange={onChange} required={def.isRequired} />;
  }

  if (def.fieldKey === 'timezone') {
    return (
      <TimezoneSelect value={v} onChange={onChange} required={def.isRequired} />
    );
  }

  if (def.fieldKey === 'password') {
    return (
      <PasswordInput
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
        <option value="">{t('form.selectPlaceholder')}</option>
        {def.options.map((o) => <option key={o} value={o}>{optionLabel(o)}</option>)}
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
        placeholder={t('form.commaSeparated')}
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
