import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import LanguageSelect from '../components/LanguageSelect';
import { errorMessage } from '../utils/errors';
import PasswordInput from '../components/PasswordInput';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Not signed in yet, so changeLanguage only remembers it on this device.
  const { login, changeLanguage } = useAuth();
  const { t } = useTranslation(['auth', 'common']);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <form className="card login-card" onSubmit={handleSubmit}>
        <div className="login-language">
          <LanguageSelect onChange={changeLanguage} />
        </div>
        <h2 style={{ marginTop: 0, color: '#3d1421' }}>{t('auth:login.title')}</h2>
        {error && <div className="error-box">{error}</div>}
        <div className="field">
          <label htmlFor="admin-login-email">{t('common:fields.email')}</label>
          <input id="admin-login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="admin-login-password">{t('common:fields.password')}</label>
          <PasswordInput id="admin-login-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? t('common:actions.signingIn') : t('common:actions.signIn')}
        </button>
      </form>
    </div>
  );
}
