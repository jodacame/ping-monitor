import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import { useRegistration } from './lib/useRegistration';
import { AlertsPage } from './pages/AlertsPage';
import { ChannelFormPage } from './pages/ChannelFormPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeveloperPage } from './pages/DeveloperPage';
import { LoginPage } from './pages/LoginPage';
import { MonitorDetailPage } from './pages/MonitorDetailPage';
import { MonitorFormPage } from './pages/MonitorFormPage';
import { RegisterPage } from './pages/RegisterPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatusPagesPage } from './pages/StatusPagesPage';
import { StatusPublicPage } from './pages/StatusPublicPage';

export function App() {
  const { ready, user } = useAuth();
  const reg = useRegistration();

  // Wait for auth, and (only when signed out) for the registration state that
  // decides between onboarding, login-only, and open registration.
  if (!ready || (!user && reg.loading)) {
    return (
      <div className="grid h-full place-items-center text-muted">
        <Spinner size={28} />
      </div>
    );
  }

  const needsSetup = reg.status?.needsSetup ?? false;
  const registrationOpen = reg.status?.registrationOpen ?? false;

  const requireAuth = (element: ReactNode): ReactNode =>
    user ? element : <Navigate to="/login" replace />;

  // Signed out, clean install → force the first-account onboarding.
  const loginElement = user ? (
    <Navigate to="/" replace />
  ) : needsSetup ? (
    <Navigate to="/register" replace />
  ) : (
    <LoginPage canRegister={registrationOpen} />
  );

  // Register is reachable only during setup or when registration is open.
  const registerElement = user ? (
    <Navigate to="/" replace />
  ) : registrationOpen ? (
    <RegisterPage isSetup={needsSetup} />
  ) : (
    <Navigate to="/login" replace />
  );

  return (
    <Routes>
      {/* Public, unauthenticated status page */}
      <Route path="/status/:slug" element={<StatusPublicPage />} />

      <Route path="/login" element={loginElement} />
      <Route path="/register" element={registerElement} />

      <Route path="/" element={requireAuth(<DashboardPage />)} />
      <Route path="/monitors/new" element={requireAuth(<MonitorFormPage />)} />
      <Route path="/monitors/:id" element={requireAuth(<MonitorDetailPage />)} />
      <Route path="/monitors/:id/edit" element={requireAuth(<MonitorFormPage />)} />

      <Route path="/alerts" element={requireAuth(<AlertsPage />)} />
      <Route path="/alerts/new" element={requireAuth(<ChannelFormPage />)} />

      <Route path="/status-pages" element={requireAuth(<StatusPagesPage />)} />
      <Route path="/developers" element={requireAuth(<DeveloperPage />)} />
      <Route path="/settings" element={requireAuth(<SettingsPage />)} />

      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  );
}
