import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import LanguageSelect from '../components/LanguageSelect';

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
    <div className="page" style={{ maxWidth: 380 }}>
      <h1>{t('auth:login.title')}</h1>
      {/* Pre-login: switches the UI and remembers the choice on this device. */}
      <div className="field">
        <LanguageSelect onChange={changeLanguage} />
      </div>
      <form className="card" onSubmit={handleSubmit}>
        {error && <div className="error-box">{error}</div>}
        <div className="field">
          <label>{t('common:fields.username')}</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>{t('common:fields.password')}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? t('common:actions.signingIn') : t('common:actions.signIn')}
        </button>
        <p className="hint" style={{ marginTop: '1rem' }}>
          {t('auth:login.newPartner')} <Link to="/signup">{t('auth:login.registerLink')}</Link>
        </p>
      </form>
    </div>
  );
}
