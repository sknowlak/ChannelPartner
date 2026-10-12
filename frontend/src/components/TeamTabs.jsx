import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Shared tab bar for the Manage Team module (its own separate top-level nav
// item, not folded into Settings) - Team Members / Roles & Permissions /
// My Profile (sections 32, 34).
export default function TeamTabs() {
  const { t } = useTranslation('team');
  const tabClass = ({ isActive }) => (isActive ? 'active' : undefined);

  return (
    <div className="status-tabs">
      <NavLink to="/team" end className={tabClass}>{t('tabs.members')}</NavLink>
      <NavLink to="/team/roles" className={tabClass}>{t('tabs.roles')}</NavLink>
      <NavLink to="/team/profile" className={tabClass}>{t('tabs.profile')}</NavLink>
    </div>
  );
}
