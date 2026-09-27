import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function NavBar() {
  const { partner, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }) => (isActive ? 'active' : undefined);

  return (
    <nav className="nav-bar">
      <span className="brand">Leadrat<br />Channel Partner</span>
      {partner ? (
        <>
          <NavLink to="/my-leads" className={linkClass}>My Leads</NavLink>
          <NavLink to="/team" className={linkClass}>Manage Team</NavLink>
          <NavLink to="/settings" className={linkClass}>Settings</NavLink>
          <NavLink to="/lookup" className={linkClass}>Lookup Registration</NavLink>
          <span className="spacer" />
          <span className="who">{partner.name} · {partner.roleName || (partner.role === 'OWNER' ? 'Owner' : 'Team Member')}</span>
          <button className="link" onClick={handleLogout}>Logout</button>
        </>
      ) : (
        <>
          <NavLink to="/login" className={linkClass}>Login</NavLink>
          <NavLink to="/signup" className={linkClass}>Register as Partner</NavLink>
          <span className="spacer" />
          <NavLink to="/simulate-registration" className={linkClass}>Simulate External CRM Registration</NavLink>
          <NavLink to="/lookup" className={linkClass}>Lookup Registration</NavLink>
        </>
      )}
    </nav>
  );
}
