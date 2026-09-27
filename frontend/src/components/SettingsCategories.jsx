import { NavLink } from 'react-router-dom';

// Settings is a hub of per-module *custom form* configuration only (section
// 38) - Manage Team is its own separate top-level module (see TeamTabs.jsx).
// Any future module's field configuration should be added the same way:
// one more category tab here, one more route under /settings.
export default function SettingsCategories() {
  const tabClass = ({ isActive }) => (isActive ? 'active' : undefined);

  return (
    <div className="status-tabs">
      <NavLink to="/settings/leads" className={tabClass}>Lead</NavLink>
      <NavLink to="/settings/users" className={tabClass}>User</NavLink>
      <NavLink to="/settings/integrations" className={tabClass}>Integrations</NavLink>
    </div>
  );
}
