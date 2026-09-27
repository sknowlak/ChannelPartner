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
import UserSettings from './pages/UserSettings';
import IntegrationSettings from './pages/IntegrationSettings';
import EditTeamMember from './pages/EditTeamMember';
import PartnerRegistration from './pages/PartnerRegistration';
import RegistrationResult from './pages/RegistrationResult';
import PartnerJourney from './pages/PartnerJourney';
import BuilderView from './pages/BuilderView';
import BookingHandover from './pages/BookingHandover';
import AuditTimeline from './pages/AuditTimeline';
import Lookup from './pages/Lookup';

function Home() {
  const { partner } = useAuth();
  return <Navigate to={partner ? '/my-leads' : '/login'} replace />;
}

function RedirectToEditTeamMember() {
  const { memberId } = useParams();
  return <Navigate to={`/team/${memberId}/edit`} replace />;
}

export default function App() {
  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-content">
        <TopBar />
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
          <Route path="/settings/users" element={<ProtectedRoute><UserSettings /></ProtectedRoute>} />
          <Route path="/settings/integrations" element={<ProtectedRoute><IntegrationSettings /></ProtectedRoute>} />

          {/* Backward-compat redirects for the short-lived /settings/team* URLs */}
          <Route path="/profile" element={<Navigate to="/team/profile" replace />} />
          <Route path="/settings/team" element={<Navigate to="/team" replace />} />
          <Route path="/settings/team/roles" element={<Navigate to="/team/roles" replace />} />
          <Route path="/settings/profile" element={<Navigate to="/team/profile" replace />} />
          <Route path="/settings/team/:memberId/edit" element={<RedirectToEditTeamMember />} />
          <Route path="/registrations/:registrationId" element={<ProtectedRoute><PartnerJourney /></ProtectedRoute>} />

          <Route path="/simulate-registration" element={<PartnerRegistration />} />
          <Route path="/registrations/result" element={<RegistrationResult />} />
          <Route path="/lookup" element={<Lookup />} />
          <Route path="/registrations/:registrationId/builder" element={<BuilderView />} />
          <Route path="/registrations/:registrationId/booking" element={<BookingHandover />} />
          <Route path="/registrations/:registrationId/audit" element={<AuditTimeline />} />
        </Routes>
      </main>
    </div>
  );
}
