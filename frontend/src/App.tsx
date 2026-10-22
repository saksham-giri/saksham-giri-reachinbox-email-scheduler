import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { FullPageSpinner } from './components/ui/Spinner';
import { useAuth } from './context/AuthContext';
import { ComposePage } from './pages/ComposePage';
import { DashboardPage } from './pages/DashboardPage';
import { EmailDetailPage } from './pages/EmailDetailPage';
import { LoginPage } from './pages/LoginPage';

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
        <Route path="/compose" element={<ComposePage />} />
        <Route path="/emails/:id" element={<EmailDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
