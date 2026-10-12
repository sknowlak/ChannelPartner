import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Settings is a hub of per-module *custom form* configuration only (section
// 38) - Manage Team is its own separate top-level module (see TeamTabs.jsx).
// Any future module's field configuration should be added the same way:
// one more category tab here, one more route under /settings.
export default function SettingsCategories() {
  const { t } = useTranslation('settings');
  const tabClass = ({ isActive }) => (isActive ? 'active' : undefined);

  return (
    <div className="status-tabs">
      <NavLink to="/settings/leads" className={tabClass}>{t('categories.lead')}</NavLink>
      <NavLink to="/settings/users" className={tabClass}>{t('categories.user')}</NavLink>
      <NavLink to="/settings/integrations" className={tabClass}>{t('categories.integrations')}</NavLink>
    </div>
  );
}
