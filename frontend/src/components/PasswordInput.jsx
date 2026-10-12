import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// A password box with a show/hide toggle. Takes the same props as <input>;
// the type is controlled here.
export default function PasswordInput(props) {
  const { t } = useTranslation('common');
  const [visible, setVisible] = useState(false);
  const label = visible ? t('actions.hidePassword') : t('actions.showPassword');

  return (
    <div className="password-input">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <line x1="3" y1="3" x2="21" y2="21" />}
        </svg>
      </button>
    </div>
  );
}
