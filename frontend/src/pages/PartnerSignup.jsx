import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { COMMON_CURRENCIES } from '../utils/currency';
import PhoneInput from '../components/PhoneInput';
import { validateMobile } from '../utils/phone';
import { focusField } from '../utils/formValidation';
import LanguageSelect from '../components/LanguageSelect';
import PasswordInput from '../components/PasswordInput';
import TimezoneSelect from '../components/TimezoneSelect';

const initialForm = {
  name: '', mobile: '', email: '', username: '', password: '',
  companyName: '', city: '', state: '', timezone: '', currency: 'USD'
};

export default function PartnerSignup() {
  const { t, i18n } = useTranslation(['auth', 'common']);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState(null);
  const [mobileError, setMobileError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { register, changeLanguage } = useAuth();
  const navigate = useNavigate();

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const mobileCheck = validateMobile(form.mobile);
    if (!mobileCheck.valid) {
      setMobileError(mobileCheck.reason);
      setError(t('common:states.fieldNeedsAttention', { count: 1 }));
      focusField('mobile');
      return;
    }
    setMobileError(null);

    setBusy(true);
    try {
      // The chosen UI language becomes the new account's saved preference.
      await register({ ...form, language: i18n.language });
      navigate('/my-leads');
    } catch (err) {
      const data = err.response?.data;
      if (data?.fieldKey === 'mobile') {
        setMobileError(data.reason);
        setError(data.reason);
        focusField('mobile');
      } else {
        setError(data?.reason || err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-wide">
      <h1>{t('auth:signup.title')}</h1>
      <p className="hint">{t('auth:signup.intro')}</p>
      <div className="field">
        <LanguageSelect onChange={changeLanguage} />
      </div>
      {error && <div className="error-box">{error}</div>}

      <form className="card" onSubmit={handleSubmit} noValidate>
        <div className="edit-form-sections">
          <div>
            <h3 className="form-section-title"><span>{t('auth:signup.accountDetails')}</span></h3>
            <div className="field">
              <label>{t('auth:signup.partnerName')}</label>
              <input value={form.name} onChange={update('name')} required />
            </div>
            <div className={`field ${mobileError ? 'invalid' : ''}`} id="field-mobile">
              <label>{t('auth:signup.mobileNumber')}</label>
              <PhoneInput
                value={form.mobile}
                onChange={(val) => { setForm((f) => ({ ...f, mobile: val })); setMobileError(null); }}
                required
              />
              {mobileError && <span className="field-error">{mobileError}</span>}
            </div>
            <div className="field">
              <label>{t('auth:signup.email')}</label>
              <input type="email" value={form.email} onChange={update('email')} required />
            </div>
            <div className="field">
              <label>{t('auth:signup.username')}</label>
              <input value={form.username} onChange={update('username')} required />
            </div>
            <div className="field">
              <label>{t('auth:signup.password')}</label>
              <PasswordInput value={form.password} onChange={update('password')} required minLength={8} />
            </div>
          </div>

          <div>
            <h3 className="form-section-title"><span>{t('auth:signup.organisationDetails')}</span></h3>
            <div className="field">
              <label>{t('auth:signup.companyName')}</label>
              <input value={form.companyName} onChange={update('companyName')} />
            </div>
            <div className="field">
              <label>{t('auth:signup.city')}</label>
              <input value={form.city} onChange={update('city')} />
            </div>
            <div className="field">
              <label>{t('auth:signup.state')}</label>
              <input value={form.state} onChange={update('state')} />
            </div>
            <div className="field">
              <label>{t('common:fields.timezone')}</label>
              <TimezoneSelect value={form.timezone} onChange={(tz) => setForm((f) => ({ ...f, timezone: tz }))} />
            </div>
            <div className="field">
              <label>{t('common:fields.currency')}</label>
              <select value={form.currency} onChange={update('currency')}>
                {COMMON_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="edit-form-footer">
          <p className="hint" style={{ margin: 0 }}>
            {t('auth:signup.haveAccount')} <Link to="/login">{t('auth:signup.signInLink')}</Link>
          </p>
          <div className="actions">
            <button className="primary" type="submit" disabled={busy}>
              {busy ? t('auth:signup.creating') : t('auth:signup.register')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
