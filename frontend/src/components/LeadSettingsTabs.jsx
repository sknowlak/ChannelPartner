import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Second-level tabs inside Settings -> Lead (section 49): the lead form's
// fields, the status catalogue (with per-status form fields + scheduling),
// and the notification rules that fire on status changes.
export default function LeadSettingsTabs() {
  const { t } = useTranslation('settings');
  const tabClass = ({ isActive }) => (isActive ? 'active' : undefined);
  return (
    <div className="status-tabs sub-tabs">
      <NavLink to="/settings/leads" end className={tabClass}>{t('leadTabs.fields')}</NavLink>
      <NavLink to="/settings/leads/statuses" className={tabClass}>{t('leadTabs.statuses')}</NavLink>
      <NavLink to="/settings/leads/notifications" className={tabClass}>{t('leadTabs.notifications')}</NavLink>
    </div>
  );
}
