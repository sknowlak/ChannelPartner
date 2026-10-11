import { NavLink } from 'react-router-dom';

// Second-level tabs inside Settings -> Lead (section 49): the lead form's
// fields, the status catalogue (with per-status form fields + scheduling),
// and the notification rules that fire on status changes.
export default function LeadSettingsTabs() {
  const tabClass = ({ isActive }) => (isActive ? 'active' : undefined);
  return (
    <div className="status-tabs sub-tabs">
      <NavLink to="/settings/leads" end className={tabClass}>Fields</NavLink>
      <NavLink to="/settings/leads/statuses" className={tabClass}>Statuses &amp; Sub-Statuses</NavLink>
      <NavLink to="/settings/leads/notifications" className={tabClass}>Notifications &amp; Schedulers</NavLink>
    </div>
  );
}
