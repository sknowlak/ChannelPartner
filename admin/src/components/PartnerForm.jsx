import { useTranslation } from 'react-i18next';
import { useDataLabels } from '../i18n/dataLabels';
import PasswordInput from './PasswordInput';

const GROUP_ORDER = [
  'Core', 'Profile', 'Address', 'KYC', 'Documents', 'Banking',
  'Business', 'Integration', 'Agreement', 'Commission', 'Other', 'Custom'
];

function sortGroups(groups) {
  return groups.sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a);
    const bi = GROUP_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// Renders a partner create/edit form entirely from FieldDefinition rows -
// when an admin adds a custom field or disables a standard one, this form
// reflects it immediately with no code change.
export default function PartnerForm({ fieldDefinitions, values, onChange, mode }) {
  const { t } = useTranslation('partners');
  // Built-in labels/groups/options are translated only while unchanged;
  // admin-entered ones show as stored. Option VALUES are never changed.
  const { fieldLabel, groupLabel, optionLabel } = useDataLabels();
  const renderable = fieldDefinitions.filter((def) => def.isEnabled && !def.isSystemGenerated);
  const groups = sortGroups([...new Set(renderable.map((d) => d.group))]);

  const getValue = (def) => (def.isCustom ? values.customFields?.[def.fieldKey] : values[def.fieldKey]);

  const setValue = (def, raw) => {
    if (def.isCustom) {
      onChange({ ...values, customFields: { ...values.customFields, [def.fieldKey]: raw } });
    } else {
      onChange({ ...values, [def.fieldKey]: raw });
    }
  };

  const renderInput = (def) => {
    const value = getValue(def) ?? '';

    if (def.fieldKey === 'password') {
      return (
        <PasswordInput
          value={value}
          onChange={(e) => setValue(def, e.target.value)}
          required={mode === 'create' && def.isRequired}
          placeholder={mode === 'edit' ? t('partners:form.keepPassword') : ''}
        />
      );
    }

    if (def.dataType === 'SELECT') {
      return (
        <select value={value} onChange={(e) => setValue(def, e.target.value)} required={def.isRequired}>
          <option value="">{t('partners:form.selectPlaceholder')}</option>
          {def.options.map((o) => <option key={o} value={o}>{optionLabel(o)}</option>)}
        </select>
      );
    }

    if (def.dataType === 'DATE') {
      return (
        <input
          type="date"
          value={value ? String(value).slice(0, 10) : ''}
          onChange={(e) => setValue(def, e.target.value)}
          required={def.isRequired}
        />
      );
    }

    if (def.dataType === 'NUMBER') {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(def, e.target.value === '' ? '' : Number(e.target.value))}
          required={def.isRequired}
        />
      );
    }

    if (def.dataType === 'TEXTAREA') {
      return <textarea rows={3} value={value} onChange={(e) => setValue(def, e.target.value)} required={def.isRequired} />;
    }

    if (def.dataType === 'LIST') {
      const text = Array.isArray(value) ? value.join(', ') : value;
      return (
        <input
          type="text"
          placeholder={t('partners:form.commaSeparated')}
          value={text}
          onChange={(e) => setValue(def, e.target.value.split(',').map((v) => v.trim()).filter(Boolean))}
        />
      );
    }

    return (
      <input
        type={def.fieldKey === 'email' || def.fieldKey === 'alternateEmail' ? 'email' : 'text'}
        value={value}
        onChange={(e) => setValue(def, e.target.value)}
        required={def.isRequired}
      />
    );
  };

  return (
    <>
      {groups.map((group) => (
        <div key={group} style={{ marginBottom: '1.2rem' }}>
          <h4 style={{ margin: '0 0 0.6rem', color: '#3d1421' }}>{groupLabel(group)}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
            {renderable.filter((d) => d.group === group).map((def) => (
              <div className="field" key={def.fieldKey}>
                <label>{def.isRequired ? t('partners:form.requiredLabel', { label: fieldLabel(def) }) : fieldLabel(def)}</label>
                {renderInput(def)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
