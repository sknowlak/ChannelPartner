import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { THEMES, getThemeChoice, setThemeChoice } from '../theme';

// Theme picker for the top bar (section 61): System, Light, Dark, Ocean, Sunset.
export default function ThemeSelect({ className = '' }) {
  const { t } = useTranslation('common');
  const [choice, setChoice] = useState(getThemeChoice);
  return (
    <label className={`theme-select ${className}`}>
      <span className="visually-hidden">{t('theme.label')}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17.5" cy="10.5" r="1.5" /><circle cx="8.5" cy="7.5" r="1.5" /><circle cx="6.5" cy="12.5" r="1.5" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c3.3 0 6-2.7 6-6 0-4.9-4.5-8.6-10-8.6z" />
      </svg>
      <select
        value={choice}
        title={t('theme.label')}
        onChange={(e) => { setChoice(e.target.value); setThemeChoice(e.target.value); }}
      >
        {THEMES.map((x) => <option key={x} value={x}>{t(`theme.${x}`)}</option>)}
      </select>
    </label>
  );
}
