import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '../i18n/locales';

// Accessible language picker (section 54): a real <label> + <select>, each
// language shown in its own script. Switching re-renders in place - no page
// reload, so the current route, form input and filters are kept.
// `onChange(code)` lets the caller also save the choice to the account.
//
// Each language in its own script, with the English name alongside so it can
// be found in a long list ("தமிழ் - Tamil").
const optionText = (l) => (l.englishName && l.englishName !== l.name ? `${l.name} - ${l.englishName}` : l.name);
const byEnglishName = (a, b) => (a.englishName || a.name).localeCompare(b.englishName || b.name);
const reviewed = SUPPORTED_LOCALES.filter((l) => l.quality !== 'machine');
const machine = SUPPORTED_LOCALES.filter((l) => l.quality === 'machine').sort(byEnglishName);
const option = (l) => <option key={l.code} value={l.code} lang={l.code}>{optionText(l)}</option>;

export default function LanguageSelect({ value, onChange, compact = false, id }) {
  const { t, i18n } = useTranslation();
  const autoId = useId();
  const selectId = id || `language-${autoId}`;
  const current = value || i18n.language;

  return (
    <span className={compact ? 'language-select compact' : 'language-select'}>
      <label htmlFor={selectId} className={compact ? 'visually-hidden' : undefined}>{t('language.label')}</label>
      <select id={selectId} value={current} onChange={(e) => onChange(e.target.value)} aria-label={t('language.label')}>
        {machine.length === 0 ? reviewed.map(option) : (
          <>
            <optgroup label={t('language.reviewed')}>{reviewed.map(option)}</optgroup>
            <optgroup label={t('language.machine')}>{machine.map(option)}</optgroup>
          </>
        )}
      </select>
    </span>
  );
}
