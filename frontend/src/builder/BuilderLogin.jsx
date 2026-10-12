import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSelect from '../components/LanguageSelect';
import { rememberLanguage } from '../i18n/language';
import { isSupportedLocale } from '../i18n/locales';
import { builderLogin, setBuilderSession } from './builderClient';
import PasswordInput from '../components/PasswordInput';

export default function BuilderLogin() {
  const { t, i18n } = useTranslation(['builder', 'common']);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Before sign-in the choice is remembered on this device only.
  const pickLanguage = (code) => {
    if (!isSupportedLocale(code)) return;
    i18n.changeLanguage(code);
    rememberLanguage(code);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await builderLogin(email, password);
      // The account's saved language (if any) takes precedence over the device choice.
      const accountLanguage = data.user?.language;
      if (isSupportedLocale(accountLanguage)) {
        rememberLanguage(accountLanguage);
        if (accountLanguage !== i18n.language) i18n.changeLanguage(accountLanguage);
      }
      setBuilderSession(data.token, data.user);
      navigate('/builder/referrals');
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <form className="card" onSubmit={submit} style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
          <LanguageSelect id="builder-login-language" value={i18n.language} onChange={pickLanguage} />
        </div>
        <h3 style={{ marginTop: 0 }}>{t('builder:login.title')}</h3>
        <p className="hint">{t('builder:login.hint')}</p>
        {error && <div className="error-box">{error}</div>}
        <div className="field">
          <label htmlFor="builder-login-email">{t('common:fields.email')}</label>
          <input id="builder-login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="builder-login-password">{t('common:fields.password')}</label>
          <PasswordInput id="builder-login-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? t('common:actions.signingIn') : t('common:actions.signIn')}</button>
      </form>
    </div>
  );
}
