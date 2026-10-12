import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Second-level tabs inside Settings -> Integrations (section 51): send leads
// out, receive them from any system, pull them from any API, and the
// partner's own API that other systems can use.
export default function IntegrationTabs() {
  const { t } = useTranslation('integrations');
  const tabClass = ({ isActive }) => (isActive ? 'active' : undefined);
  return (
    <div className="status-tabs sub-tabs">
      <NavLink to="/settings/integrations" end className={tabClass}>{t('tabs.push')}</NavLink>
      <NavLink to="/settings/integrations/receive" className={tabClass}>{t('tabs.receive')}</NavLink>
      <NavLink to="/settings/integrations/pull" className={tabClass}>{t('tabs.pull')}</NavLink>
      <NavLink to="/settings/integrations/api" className={tabClass}>{t('tabs.api')}</NavLink>
    </div>
  );
}
