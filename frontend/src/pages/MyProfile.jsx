import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMyProfile, updateMyProfile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COMMON_TIMEZONES, detectBrowserTimezone, formatDateTime } from '../utils/timezone';
import { COMMON_CURRENCIES } from '../utils/currency';
import PhoneInput from '../components/PhoneInput';
import TeamTabs from '../components/TeamTabs';
import { validateMobile } from '../utils/phone';
import { focusField } from '../utils/formValidation';
import LanguageSelect from '../components/LanguageSelect';
import { roleLabel } from '../i18n/dataLabels';

export default function MyProfile() {
  const { t } = useTranslation(['team', 'common']);
  const { partner, updateLocalPartner, changeLanguage } = useAuth();
  const [languageSaved, setLanguageSaved] = useState(false);
  const [form, setForm] = useState(null);
  const [role, setRole] = useState(partner.role || null);
  const [roleName, setRoleName] = useState(partner.roleName || '');
  const [error, setError] = useState(null);
  const [mobileError, setMobileError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMyProfile()
      .then(({ data }) => {
        setForm({ ...data.profile, password: '', currentPassword: '' });
        setRole(data.role); // sourced fresh, not the cached session (see ManageTeam.jsx)
        setRoleName(data.roleName);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, []);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (form.mobile) {
      const mobileCheck = validateMobile(form.mobile);
      if (!mobileCheck.valid) {
        setMobileError(mobileCheck.reason);
        setError(t('common:states.fieldNeedsAttention', { count: 1 }));
        focusField('mobile');
        return;
      }
    }
    setMobileError(null);

    setBusy(true);
    try {
      const payload = { ...form };
      if (!payload.password) {
        delete payload.password;
        delete payload.currentPassword;
      }
      const { data } = await updateMyProfile(payload);
      // A password change returns a new session token (older ones are revoked).
      updateLocalPartner(data.profile, data.token);
      setForm({ ...data.profile, password: '', currentPassword: '' });
      setRole(data.role);
      setSaved(true);
    } catch (err) {
      const data = err.response?.data;
      if (data?.fieldKey === 'mobile') {
        setMobileError(data.reason);
        setError(data.reason);
        focusField('mobile');
      } else if (data?.fieldKey === 'currentPassword' || data?.fieldKey === 'password') {
        setError(data.reason);
        focusField(data.fieldKey);
      } else {
        setError(data?.reason || err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (error && !form) return <div className="page page-wide"><div className="error-box">{error}</div></div>;
  if (!form) return <div className="page page-wide">{t('common:states.loading')}</div>;

  const isOwner = role === 'OWNER';
  const roleText = roleName ? roleLabel(roleName) : t(isOwner ? 'team:roles.owner' : 'team:roles.member');

  // The preferred language (section 54) applies immediately and is saved to
  // the account on its own - it doesn't wait for "Save Changes", and it
  // doesn't touch any other field in this form.
  const pickLanguage = async (code) => {
    setLanguageSaved(false);
    setForm((f) => ({ ...f, language: code }));
    await changeLanguage(code);
    setLanguageSaved(true);
  };

  return (
    <div className="page page-wide">
      <h1>{t('team:title')}</h1>
      <TeamTabs />
      {error && <div className="error-box">{error}</div>}
      {saved && <div className="card" style={{ background: '#e1f5e5', color: '#1a7f3c' }}>{t('team:profile.updated')}</div>}

      <form className="card" onSubmit={handleSubmit} noValidate>
        <div className="edit-form-sections">
          <div>
            <h3 className="form-section-title"><span>{t('team:profile.basicInfo')}</span></h3>
            <div className="field">
              <label>{t('common:fields.name')}</label>
              <input value={form.name || ''} onChange={update('name')} required />
            </div>
            <div className={`field ${mobileError ? 'invalid' : ''}`} id="field-mobile">
              <label>{t('common:fields.mobile')}</label>
              <PhoneInput
                value={form.mobile || ''}
                onChange={(val) => { setForm((f) => ({ ...f, mobile: val })); setMobileError(null); }}
              />
              {mobileError && <span className="field-error">{mobileError}</span>}
            </div>
            <div className="field">
              <label>{t('common:fields.email')}</label>
              <input type="email" value={form.email || ''} onChange={update('email')} />
            </div>
          </div>

          <div>
            <h3 className="form-section-title"><span>{isOwner ? t('team:profile.organisationInfo') : t('team:profile.preferences')}</span></h3>
            {isOwner && (
              <>
                <div className="field">
                  <label>{t('team:profile.companyName')}</label>
                  <input value={form.companyName || ''} onChange={update('companyName')} />
                </div>
                <div className="field">
                  <label>{t('team:profile.city')}</label>
                  <input value={form.city || ''} onChange={update('city')} />
                </div>
                <div className="field">
                  <label>{t('team:profile.state')}</label>
                  <input value={form.state || ''} onChange={update('state')} />
                </div>
                <div className="field">
                  <label>{t('common:fields.currency')}</label>
                  <select value={form.currency || 'USD'} onChange={update('currency')}>
                    {(COMMON_CURRENCIES.includes(form.currency) ? COMMON_CURRENCIES : [form.currency || 'USD', ...COMMON_CURRENCIES]).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <p className="hint" style={{ margin: '0.3rem 0 0' }}>{t('team:profile.currencyHelp')}</p>
                </div>
              </>
            )}
            <div className="field" id="field-language">
              <LanguageSelect id="profile-language" value={form.language || undefined} onChange={pickLanguage} />
              <p className="hint" style={{ margin: '0.3rem 0 0' }}>
                {languageSaved ? t('team:profile.languageSaved') : t('common:language.help')}
              </p>
            </div>
            <div className="field">
              <label>{t('common:fields.timezone')}</label>
              <select value={form.timezone || 'UTC'} onChange={update('timezone')}>
                {(COMMON_TIMEZONES.includes(form.timezone) ? COMMON_TIMEZONES : [form.timezone || 'UTC', ...COMMON_TIMEZONES]).map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
              <button
                type="button"
                className="secondary"
                style={{ marginTop: '0.4rem', alignSelf: 'flex-start' }}
                onClick={() => setForm((f) => ({ ...f, timezone: detectBrowserTimezone() }))}
              >
                {t('team:profile.useDeviceTimezone', { timezone: detectBrowserTimezone() })}
              </button>
            </div>
          </div>

          <div>
            <h3 className="form-section-title"><span>{t('team:profile.securityRole')}</span></h3>
            <div className="field">
              <label>{t('common:fields.role')}</label>
              <input value={roleText} disabled />
            </div>
            <div className="field" id="field-password">
              <label>{t('team:profile.newPassword')}</label>
              <input type="password" name="password" autoComplete="new-password" value={form.password} onChange={update('password')} minLength={8} />
            </div>
            {form.password && (
              <div className="field" id="field-currentPassword">
                <label>{t('team:profile.currentPassword')} *</label>
                <input type="password" name="currentPassword" autoComplete="current-password" value={form.currentPassword} onChange={update('currentPassword')} required />
              </div>
            )}
          </div>
        </div>

        <div className="edit-form-footer">
          <div className="meta">
            <span><strong>{t('common:fields.username')}</strong>{partner.username}</span>
            <span><strong>{t('common:fields.role')}</strong>{roleText}</span>
            {form.createdAt && <span><strong>{t('team:profile.memberSince')}</strong>{formatDateTime(form.createdAt, form.timezone)}</span>}
          </div>
          <div className="actions">
            <button className="primary" type="submit" disabled={busy}>{busy ? t('common:actions.saving') : t('common:actions.saveChanges')}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
