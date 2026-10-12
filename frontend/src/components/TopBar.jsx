import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import LanguageSelect from './LanguageSelect';

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

export default function TopBar() {
  const { t } = useTranslation('shell');
  const { pathname } = useLocation();
  const { partner, changeLanguage } = useAuth();

  return (
    <header className="top-bar">
      <h2>{t(`titles.${titleKeyFor(pathname)}`)}</h2>
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
