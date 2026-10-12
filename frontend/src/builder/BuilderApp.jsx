import { useEffect } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSelect from '../components/LanguageSelect';
import { rememberLanguage } from '../i18n/language';
import { isSupportedLocale } from '../i18n/locales';
import { clearBuilderSession, getBuilderMe, getBuilderSession, updateBuilderMe, updateBuilderSessionUser } from './builderClient';
import BuilderLogin from './BuilderLogin';
import BuilderReferrals from './BuilderReferrals';
import BuilderReferral from './BuilderReferral';

// Builder portal shell (section 52): referrals for this builder's projects,
// accept/reject, booking confirmation and the referral history.
function RequireBuilder({ children }) {
  return getBuilderSession() ? children : <Navigate to="/builder/login" replace />;
}

export default function BuilderApp() {
  const { t, i18n } = useTranslation(['builder', 'common']);
  const navigate = useNavigate();
  const user = getBuilderSession();
  const signedIn = Boolean(user);

  // The account's saved language wins once known (section 54) - refresh it
  // from the server so a choice made on another device follows the user.
  useEffect(() => {
    if (!signedIn) return;
    getBuilderMe()
      .then(({ data }) => {
        const language = data.user?.language;
        if (isSupportedLocale(language)) {
          updateBuilderSessionUser({ language });
          rememberLanguage(language);
          if (language !== i18n.language) i18n.changeLanguage(language);
        }
      })
      .catch(() => {});
  }, [signedIn, i18n]);

  // Switch now (no reload) and save to the builder user's account.
  const pickLanguage = (code) => {
    if (!isSupportedLocale(code)) return;
    i18n.changeLanguage(code);
    rememberLanguage(code);
    updateBuilderSessionUser({ language: code });
    updateBuilderMe({ language: code }).catch(() => {});
  };

  const logout = () => {
    clearBuilderSession();
    navigate('/builder/login');
  };
  const linkClass = ({ isActive }) => (isActive ? 'active' : undefined);

  return (
    <div className="app-shell">
      <nav className="nav-bar">
        <span className="brand">Leadrat<br />{t('builder:shell.portal')}</span>{/* i18n-ignore: product name */}
        {user ? (
          <>
            <NavLink to="/builder/referrals" className={linkClass}>{t('builder:shell.referrals')}</NavLink>
            <span className="spacer" />
            <LanguageSelect compact id="builder-nav-language" value={i18n.language} onChange={pickLanguage} />
            <span className="who">{user.name}</span>
            <button className="link" onClick={logout}>{t('common:actions.logout')}</button>
          </>
        ) : (
          <>
            <NavLink to="/builder/login" className={linkClass}>{t('builder:shell.builderLogin')}</NavLink>
            <span className="spacer" />
            <NavLink to="/login" className={linkClass}>{t('builder:shell.partnerLogin')}</NavLink>
          </>
        )}
      </nav>
      <main className="app-content">
        <header className="top-bar"><h2>{t('builder:shell.portal')}</h2></header>
        <Routes>
          <Route path="login" element={<BuilderLogin />} />
          <Route path="referrals" element={<RequireBuilder><BuilderReferrals /></RequireBuilder>} />
          <Route path="referrals/:registrationId" element={<RequireBuilder><BuilderReferral /></RequireBuilder>} />
          <Route path="*" element={<Navigate to={user ? '/builder/referrals' : '/builder/login'} replace />} />
        </Routes>
      </main>
    </div>
  );
}
