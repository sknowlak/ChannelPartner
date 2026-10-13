import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import LanguageSelect from './LanguageSelect';
import MenuButton from './MenuButton';

// Route -> translation key (shell:titles.*); resolved with t() at render
// time so the title follows a language switch.
const PAGE_TITLES = {
  '/my-leads': 'myLeads',
  '/register-lead': 'addLead',
  '/team': 'manageTeam',
  '/team/roles': 'roles',
  '/team/profile': 'profile',
  '/settings': 'settings',
  '/settings/leads': 'settings',
  '/settings/leads/statuses': 'settings',
  '/settings/leads/notifications': 'settings',
  '/settings/users': 'settings',
  '/settings/integrations': 'settings',
  '/settings/connectors': 'settings',
  '/settings/connectors/linkedin': 'settings',
  '/login': 'signIn',
  '/signup': 'signup'
};

function titleKeyFor(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/team/') && pathname.endsWith('/edit')) return 'editMember';
  if (pathname.startsWith('/registrations/') && pathname.endsWith('/edit')) return 'editLead';
  if (pathname.startsWith('/registrations/')) return 'registrationDetail';
  return 'default';
}

export default function TopBar({ menuOpen = false, onMenu }) {
  const { t } = useTranslation(['shell', 'common']);
  const { pathname } = useLocation();
  const { partner, changeLanguage } = useAuth();

  return (
    <header className="top-bar">
      <div className="top-bar-title">
        {onMenu && <MenuButton open={menuOpen} onClick={onMenu} label={t('common:actions.openMenu')} />}
        <h2>{t(`shell:titles.${titleKeyFor(pathname)}`)}</h2>
      </div>
      {partner && (
        <div className="top-bar-user">
          {/* Signed in: switches now and saves to the account (like My Profile). */}
          <LanguageSelect compact onChange={changeLanguage} />
          <NotificationBell timezone={partner.timezone} />
          <span className="avatar">{partner.name.charAt(0).toUpperCase()}</span>
          <span>{partner.name}</span>
        </div>
      )}
    </header>
  );
}
