import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { partner } = useAuth();
  if (!partner) return <Navigate to="/login" replace />;
  return children;
}
