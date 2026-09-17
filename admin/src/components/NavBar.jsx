import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { COMMON_TIMEZONES } from '../utils/timezone';

export default function NavBar() {
  const { admin, logout, timezone, setTimezone } = useAuth();
  const navigate = useNavigate();

  if (!admin) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="nav-bar">
      <span className="brand">Leadrat · Admin Portal</span>
      <Link to="/">Dashboard</Link>
      <Link to="/partners">Channel Partners</Link>
      <Link to="/partner-fields">Partner Fields</Link>
      <Link to="/registrations">Registrations</Link>
      <Link to="/audit">Audit</Link>
      <Link to="/settings">Settings</Link>
      <span className="spacer" />
      <select
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        title="Your timezone - affects how dates are displayed"
        style={{ background: '#3d1421', color: '#f5c9d6', border: '1px solid #6b2c3d', borderRadius: 6, padding: '0.3rem 0.5rem' }}
      >
        {(COMMON_TIMEZONES.includes(timezone) ? COMMON_TIMEZONES : [timezone, ...COMMON_TIMEZONES]).map((tz) => (
          <option key={tz} value={tz} style={{ color: '#1a1a1a' }}>{tz}</option>
        ))}
      </select>
      <span className="who">{admin.name} ({admin.role})</span>
      <button className="link" onClick={handleLogout}>Logout</button>
    </nav>
  );
}
