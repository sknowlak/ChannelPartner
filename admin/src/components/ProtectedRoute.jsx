import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { admin } = useAuth();
  if (!admin) return <Navigate to="/login" replace />;
  return children;
}
