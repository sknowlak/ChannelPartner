import { NavLink } from 'react-router-dom';

// Second-level tabs inside Settings -> Integrations (section 51): send leads
// out, receive them from any system, pull them from any API, and the
// partner's own API that other systems can use.
export default function IntegrationTabs() {
  const tabClass = ({ isActive }) => (isActive ? 'active' : undefined);
  return (
    <div className="status-tabs sub-tabs">
      <NavLink to="/settings/integrations" end className={tabClass}>Push (Send Out)</NavLink>
      <NavLink to="/settings/integrations/receive" className={tabClass}>Receive (Webhooks In)</NavLink>
      <NavLink to="/settings/integrations/pull" className={tabClass}>Pull (Fetch from API)</NavLink>
      <NavLink to="/settings/integrations/api" className={tabClass}>Your API</NavLink>
    </div>
  );
}
