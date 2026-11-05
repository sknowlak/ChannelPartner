import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { COMMON_TIMEZONES } from '../utils/timezone';
import { enumLabel } from '../i18n/enumLabels';
import LanguageSelect from './LanguageSelect';
import ThemeSelect from './ThemeSelect';

export default function NavBar() {
  const { admin, logout, timezone, setTimezone, changeLanguage } = useAuth();
  const { t } = useTranslation(['nav', 'common', 'enums']);
  const navigate = useNavigate();

  if (!admin) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="nav-bar" aria-label={t('nav:mainMenu')}>
      <span className="brand">{t('nav:brand')}</span>
      <Link to="/">{t('nav:links.dashboard')}</Link>
      <Link to="/partners">{t('nav:links.partners')}</Link>
      <Link to="/partner-fields">{t('nav:links.partnerFields')}</Link>
      <Link to="/builders">{t('nav:links.builders')}</Link>
      <Link to="/registrations">{t('nav:links.registrations')}</Link>
      <Link to="/disputes">{t('nav:links.disputes')}</Link>
      <Link to="/audit">{t('nav:links.audit')}</Link>
      <Link to="/settings">{t('nav:links.settings')}</Link>
      <span className="spacer" />
      {/* Switches instantly and saves to the admin's account (PATCH /auth/me). */}
      <LanguageSelect compact onChange={changeLanguage} />
      <ThemeSelect className="nav-theme" />
      <select
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        title={t('nav:timezoneTitle')}
        aria-label={t('nav:timezoneTitle')}
        className="nav-select"
      >
        {(COMMON_TIMEZONES.includes(timezone) ? COMMON_TIMEZONES : [timezone, ...COMMON_TIMEZONES]).map((tz) => (
          <option key={tz} value={tz}>{tz}</option>
        ))}
      </select>
      <span className="who">{t('nav:who', { name: admin.name, role: enumLabel('adminRole', admin.role) })}</span>
      <button className="link" onClick={handleLogout}>{t('common:actions.logout')}</button>
    </nav>
  );
}
