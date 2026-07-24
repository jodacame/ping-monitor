import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import { AlertsPage } from './pages/AlertsPage';
import { ChannelFormPage } from './pages/ChannelFormPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { MonitorDetailPage } from './pages/MonitorDetailPage';
import { MonitorFormPage } from './pages/MonitorFormPage';
import { RegisterPage } from './pages/RegisterPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatusPagesPage } from './pages/StatusPagesPage';

export function App() {
  const { ready, user } = useAuth();

  if (!ready) {
    return (
      <div className="grid h-full place-items-center text-muted">
        <Spinner size={28} />
      </div>
    );
  }

  const requireAuth = (element: ReactNode): ReactNode =>
    user ? element : <Navigate to="/login" replace />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />

      <Route path="/" element={requireAuth(<DashboardPage />)} />
      <Route path="/monitors/new" element={requireAuth(<MonitorFormPage />)} />
      <Route path="/monitors/:id" element={requireAuth(<MonitorDetailPage />)} />
      <Route path="/monitors/:id/edit" element={requireAuth(<MonitorFormPage />)} />

      <Route path="/alerts" element={requireAuth(<AlertsPage />)} />
      <Route path="/alerts/new" element={requireAuth(<ChannelFormPage />)} />

      <Route path="/status-pages" element={requireAuth(<StatusPagesPage />)} />
      <Route path="/settings" element={requireAuth(<SettingsPage />)} />

      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  );
}
