import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PAGE_TITLES = {
  '/my-leads': 'My Leads',
  '/register-lead': 'Register New Lead',
  '/team': 'Manage Team',
  '/profile': 'My Profile',
  '/lookup': 'Lookup Registration',
  '/login': 'Sign In',
  '/signup': 'Channel Partner Registration',
  '/simulate-registration': 'Simulate External CRM Registration'
};

function titleFor(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/registrations/')) return 'Registration Detail';
  if (pathname.startsWith('/team/') && pathname.endsWith('/edit')) return 'Edit Team Member';
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
          <span className="avatar">{partner.name.charAt(0).toUpperCase()}</span>
          <span>{partner.name}</span>
        </div>
      )}
    </header>
  );
}
