import { Navigate, Route, Routes } from 'react-router-dom';
import NavBar from './components/NavBar';
import TopBar from './components/TopBar';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import PartnerLogin from './pages/PartnerLogin';
import PartnerSignup from './pages/PartnerSignup';
import MyLeads from './pages/MyLeads';
import RegisterLead from './pages/RegisterLead';
import MyProfile from './pages/MyProfile';
import ManageTeam from './pages/ManageTeam';
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
          <Route path="/profile" element={<ProtectedRoute><MyProfile /></ProtectedRoute>} />
          <Route path="/team" element={<ProtectedRoute><ManageTeam /></ProtectedRoute>} />
          <Route path="/team/:memberId/edit" element={<ProtectedRoute><EditTeamMember /></ProtectedRoute>} />
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
