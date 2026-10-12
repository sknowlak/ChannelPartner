import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import LanguageSelect from '../components/LanguageSelect';
import PasswordInput from '../components/PasswordInput';
import BrandLogo from '../components/BrandLogo';

// Icons for the "what you can do here" list on the left panel.
const ICONS = {
  register: <path d="M12 5v14M5 12h14" />,
  protect: <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3zM9 12l2 2 4-4" />,
  track: <path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6" />,
  handover: <path d="M3 12h13M12 7l5 5-5 5M20 5v14" />
};
const FEATURES = ['register', 'protect', 'track', 'handover'];

export default function PartnerLogin() {
  const { t } = useTranslation(['auth', 'common']);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { login, changeLanguage } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      navigate('/my-leads');
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page login-page">
      <section className="login-hero">
        <BrandLogo size={52} sub={t('auth:login.portalName')} className="login-hero-logo" />
        <h2>{t('auth:login.heroTitle')}</h2>
        <p className="login-hero-intro">{t('auth:login.heroIntro')}</p>
        <ul className="login-features">
          {FEATURES.map((key) => (
            <li key={key} className={`login-feature login-feature-${key}`}>
              <span className="login-feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {ICONS[key]}
                </svg>
              </span>
              <span>
                <strong>{t(`auth:login.features.${key}.title`)}</strong>
                <span>{t(`auth:login.features.${key}.text`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="login-panel">
        <h1>{t('auth:login.title')}</h1>
        <p className="hint login-welcome">{t('auth:login.welcome')}</p>
        {/* Pre-login: switches the UI and remembers the choice on this device. */}
        <div className="field">
          <LanguageSelect onChange={changeLanguage} />
        </div>
        <form className="card login-card" onSubmit={handleSubmit}>
          {error && <div className="error-box">{error}</div>}
          <div className="field">
            <label>{t('common:fields.username')}</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>{t('common:fields.password')}</label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="primary login-submit" type="submit" disabled={busy}>
            {busy ? t('common:actions.signingIn') : t('common:actions.signIn')}
          </button>
          <p className="login-secure">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" />
            </svg>
            {t('auth:login.secure')}
          </p>
          <p className="hint login-links">
            {t('auth:login.newPartner')} <Link to="/signup">{t('auth:login.registerLink')}</Link>
          </p>
          <p className="hint login-links">
            {t('auth:login.builderPrompt')} <Link to="/builder/login">{t('auth:login.builderLink')}</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
