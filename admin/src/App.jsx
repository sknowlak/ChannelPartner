import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import NavBar from './components/NavBar';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Partners from './pages/Partners';
import PartnerDetail from './pages/PartnerDetail';
import PartnerFields from './pages/PartnerFields';
import Registrations from './pages/Registrations';
import RegistrationDetail from './pages/RegistrationDetail';
import Audit from './pages/Audit';
import Settings from './pages/Settings';
import Builders from './pages/Builders';
import BuilderDetail from './pages/BuilderDetail';

export default function App() {
  const { t, i18n } = useTranslation('common');
  // The browser tab title follows the UI language.
  useEffect(() => {
    document.title = t('common:brand.admin');
  }, [t, i18n.language]);

  return (
    <div className="app-shell">
      <NavBar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/partners" element={<ProtectedRoute><Partners /></ProtectedRoute>} />
        <Route path="/partners/:partnerId" element={<ProtectedRoute><PartnerDetail /></ProtectedRoute>} />
        <Route path="/partner-fields" element={<ProtectedRoute><PartnerFields /></ProtectedRoute>} />
        <Route path="/registrations" element={<ProtectedRoute><Registrations /></ProtectedRoute>} />
        <Route path="/registrations/:registrationId" element={<ProtectedRoute><RegistrationDetail /></ProtectedRoute>} />
        <Route path="/audit" element={<ProtectedRoute><Audit /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/builders" element={<ProtectedRoute><Builders /></ProtectedRoute>} />
        <Route path="/builders/:builderId" element={<ProtectedRoute><BuilderDetail /></ProtectedRoute>} />
      </Routes>
    </div>
  );
}
