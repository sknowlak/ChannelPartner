import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

const PAGE_TITLES = {
  '/my-leads': 'My Leads',
  '/register-lead': 'Add Lead',
  '/team': 'Manage Team',
  '/team/roles': 'Roles & Permissions',
  '/team/profile': 'My Profile',
  '/settings': 'Settings',
  '/settings/leads': 'Settings',
  '/settings/leads/statuses': 'Settings',
  '/settings/leads/notifications': 'Settings',
  '/settings/users': 'Settings',
  '/settings/integrations': 'Settings',
  '/lookup': 'Lookup Registration',
  '/login': 'Sign In',
  '/signup': 'Channel Partner Registration',
  '/simulate-registration': 'Simulate External CRM Registration'
};

function titleFor(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/team/') && pathname.endsWith('/edit')) return 'Edit Team Member';
  if (pathname.startsWith('/registrations/') && pathname.endsWith('/edit')) return 'Edit Lead';
  if (pathname.startsWith('/registrations/')) return 'Registration Detail';
  return 'Leadrat';
}

export default function TopBar() {
  const { pathname } = useLocation();
  const { partner } = useAuth();

  return (
    <header className="top-bar">
      <h2>{titleFor(pathname)}</h2>
      {partner && (
        <div className="top-bar-user">
          <NotificationBell timezone={partner.timezone} />
          <span className="avatar">{partner.name.charAt(0).toUpperCase()}</span>
          <span>{partner.name}</span>
        </div>
      )}
    </header>
  );
}
