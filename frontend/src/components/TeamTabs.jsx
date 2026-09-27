import { NavLink } from 'react-router-dom';

// Shared tab bar for the Manage Team module (its own separate top-level nav
// item, not folded into Settings) - Team Members / Roles & Permissions /
// My Profile (sections 32, 34).
export default function TeamTabs() {
  const tabClass = ({ isActive }) => (isActive ? 'active' : undefined);

  return (
    <div className="status-tabs">
      <NavLink to="/team" end className={tabClass}>Team Members</NavLink>
      <NavLink to="/team/roles" className={tabClass}>Roles &amp; Permissions</NavLink>
      <NavLink to="/team/profile" className={tabClass}>My Profile</NavLink>
    </div>
  );
}
