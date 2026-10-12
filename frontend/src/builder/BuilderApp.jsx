import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { clearBuilderSession, getBuilderSession } from './builderClient';
import BuilderLogin from './BuilderLogin';
import BuilderReferrals from './BuilderReferrals';
import BuilderReferral from './BuilderReferral';

// Builder portal shell (section 52): referrals for this builder's projects,
// accept/reject, booking confirmation and the referral history.
function RequireBuilder({ children }) {
  return getBuilderSession() ? children : <Navigate to="/builder/login" replace />;
}

export default function BuilderApp() {
  const navigate = useNavigate();
  const user = getBuilderSession();
  const logout = () => {
    clearBuilderSession();
    navigate('/builder/login');
  };
  const linkClass = ({ isActive }) => (isActive ? 'active' : undefined);

  return (
    <div className="app-shell">
      <nav className="nav-bar">
        <span className="brand">Leadrat<br />Builder Portal</span>
        {user ? (
          <>
            <NavLink to="/builder/referrals" className={linkClass}>Referrals</NavLink>
            <span className="spacer" />
            <span className="who">{user.name}</span>
            <button className="link" onClick={logout}>Logout</button>
          </>
        ) : (
          <>
            <NavLink to="/builder/login" className={linkClass}>Builder Login</NavLink>
            <span className="spacer" />
            <NavLink to="/login" className={linkClass}>Channel Partner Login</NavLink>
          </>
        )}
      </nav>
      <main className="app-content">
        <header className="top-bar"><h2>Builder Portal</h2></header>
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
