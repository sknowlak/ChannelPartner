import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import NavBar from './components/NavBar';
import TopBar from './components/TopBar';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import PartnerLogin from './pages/PartnerLogin';
import PartnerSignup from './pages/PartnerSignup';
import MyLeads from './pages/MyLeads';
import RegisterLead from './pages/RegisterLead';
import EditLead from './pages/EditLead';
import MyProfile from './pages/MyProfile';
import ManageTeam from './pages/ManageTeam';
import RolesPermissions from './pages/RolesPermissions';
import LeadSettings from './pages/LeadSettings';
import LeadStatusSettings from './pages/LeadStatusSettings';
import NotificationSettings from './pages/NotificationSettings';
import UserSettings from './pages/UserSettings';
import IntegrationSettings from './pages/IntegrationSettings';
import IntegrationSources from './pages/IntegrationSources';
import IntegrationApi from './pages/IntegrationApi';
import EditTeamMember from './pages/EditTeamMember';
import PartnerJourney from './pages/PartnerJourney';
import BuilderApp from './builder/BuilderApp';
import { NavBackdrop, useNavDrawer } from './components/MenuButton';
import Connectors from './pages/Connectors';
import LinkedInConnector from './pages/LinkedInConnector';

function Home() {
  const { partner } = useAuth();
  return <Navigate to={partner ? '/my-leads' : '/login'} replace />;
}

function RedirectToEditTeamMember() {
  const { memberId } = useParams();
  return <Navigate to={`/team/${memberId}/edit`} replace />;
}

// The builder portal (section 52) has its own shell, login and session,
// separate from the partner portal below.
export default function App() {
  return (
    <Routes>
      <Route path="/builder/*" element={<BuilderApp />} />
      <Route path="*" element={<PartnerApp />} />
    </Routes>
  );
}

function PartnerApp() {
  const drawer = useNavDrawer();
  return (
    <div className="app-shell">
      <NavBar open={drawer.open} />
      <NavBackdrop open={drawer.open} onClose={drawer.close} />
      <main className="app-content">
        <TopBar menuOpen={drawer.open} onMenu={drawer.toggle} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<PartnerLogin />} />
          <Route path="/signup" element={<PartnerSignup />} />

          <Route path="/my-leads" element={<ProtectedRoute><MyLeads /></ProtectedRoute>} />
          <Route path="/register-lead" element={<ProtectedRoute><RegisterLead /></ProtectedRoute>} />
          <Route path="/registrations/:registrationId/edit" element={<ProtectedRoute><EditLead /></ProtectedRoute>} />
          {/* Manage Team is its own top-level module, separate from Settings
              (section 38 revert). Settings is a pure hub of per-module custom
              form configuration: Lead / User, more as modules are added. */}
          <Route path="/team" element={<ProtectedRoute><ManageTeam /></ProtectedRoute>} />
          <Route path="/team/roles" element={<ProtectedRoute><RolesPermissions /></ProtectedRoute>} />
          <Route path="/team/profile" element={<ProtectedRoute><MyProfile /></ProtectedRoute>} />
          <Route path="/team/:memberId/edit" element={<ProtectedRoute><EditTeamMember /></ProtectedRoute>} />

          <Route path="/settings" element={<Navigate to="/settings/leads" replace />} />
          <Route path="/settings/leads" element={<ProtectedRoute><LeadSettings /></ProtectedRoute>} />
          <Route path="/settings/leads/statuses" element={<ProtectedRoute><LeadStatusSettings /></ProtectedRoute>} />
          <Route path="/settings/leads/notifications" element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />
          <Route path="/settings/users" element={<ProtectedRoute><UserSettings /></ProtectedRoute>} />
          <Route path="/settings/integrations" element={<ProtectedRoute><IntegrationSettings /></ProtectedRoute>} />
          <Route path="/settings/connectors" element={<ProtectedRoute><Connectors /></ProtectedRoute>} />
          <Route path="/settings/connectors/linkedin" element={<ProtectedRoute><LinkedInConnector /></ProtectedRoute>} />
          <Route path="/settings/integrations/receive" element={<ProtectedRoute><IntegrationSources kind="RECEIVE" key="RECEIVE" /></ProtectedRoute>} />
          <Route path="/settings/integrations/pull" element={<ProtectedRoute><IntegrationSources kind="PULL" key="PULL" /></ProtectedRoute>} />
          <Route path="/settings/integrations/api" element={<ProtectedRoute><IntegrationApi /></ProtectedRoute>} />

          {/* Backward-compat redirects for the short-lived /settings/team* URLs */}
          <Route path="/profile" element={<Navigate to="/team/profile" replace />} />
          <Route path="/settings/team" element={<Navigate to="/team" replace />} />
          <Route path="/settings/team/roles" element={<Navigate to="/team/roles" replace />} />
          <Route path="/settings/profile" element={<Navigate to="/team/profile" replace />} />
          <Route path="/settings/team/:memberId/edit" element={<RedirectToEditTeamMember />} />
          <Route path="/registrations/:registrationId" element={<ProtectedRoute><PartnerJourney /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}
