/**
 * components/ProtectedRoute.jsx
 *
 * Wraps routes that require authentication.
 * Redirects unauthenticated users to /login.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppLayout from './layout/AppLayout';

export default function ProtectedRoute() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    // Preserve the attempted URL so we can redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
