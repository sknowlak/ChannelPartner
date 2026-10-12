import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { intlLocale } from '../i18n/format';
import { COUNTRY_OPTIONS, detectDefaultCountry, splitMobile, joinMobile } from '../utils/phone';

// Country-code select + local-number input that together produce/consume a
// single "+<dialcode><number>" string, matching the single-value contract
// every other DynamicFieldInput branch uses. Kept as its own component (not
// inlined in DynamicFieldInput) since MyProfile/PartnerSignup/
// PartnerRegistration need the exact same control outside that renderer.
export default function PhoneInput({ value, onChange, required }) {
  const { t, i18n } = useTranslation('leads');
  const [iso2, setIso2] = useState(() => splitMobile(value).iso2);
  // Country names in the UI language (COUNTRY_OPTIONS is built once, in
  // English); the stored value is still the ISO code + dial code.
  const countries = useMemo(() => {
    let names = null;
    try {
      names = new Intl.DisplayNames([intlLocale()], { type: 'region' });
    } catch {
      return COUNTRY_OPTIONS;
    }
    return COUNTRY_OPTIONS
      .map((c) => ({ ...c, name: names.of(c.iso2) || c.name }))
      .sort((a, b) => a.name.localeCompare(b.name, intlLocale()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);
  const [local, setLocal] = useState(() => splitMobile(value).local);

  // Only re-derive from `value` when it changed from OUTSIDE this control
  // (loading a different record, clearing the form) - not on the echo of
  // our own onChange, which would otherwise flip the country dropdown back
  // to a "detected" guess every keystroke while a number is still partial.
  useEffect(() => {
    if (value === joinMobile(iso2, local)) return;
    const split = splitMobile(value);
    setIso2(split.iso2);
    setLocal(split.local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const update = (nextIso2, nextLocal) => {
    setIso2(nextIso2);
    setLocal(nextLocal);
    onChange(joinMobile(nextIso2, nextLocal));
  };

  return (
    <div style={{ display: 'flex', gap: '0.4rem' }}>
      <select
        value={iso2}
        onChange={(e) => update(e.target.value, local)}
        aria-label={t('form.countryCode')}
        style={{ maxWidth: '11rem', flexShrink: 0 }}
      >
        {(countries.some((c) => c.iso2 === iso2) ? countries : [{ iso2, dialCode: '', name: iso2 }, ...countries]).map((c) => (
          <option key={c.iso2} value={c.iso2}>{c.name} ({c.dialCode})</option>
        ))}
      </select>
      <input
        type="tel"
        value={local}
        onChange={(e) => update(iso2, e.target.value.replace(/\D/g, ''))}
        required={required}
        placeholder={t('form.phonePlaceholder')}
        style={{ flex: 1 }}
      />
    </div>
  );
}
