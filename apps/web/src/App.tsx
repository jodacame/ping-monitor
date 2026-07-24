import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

export function App() {
  const { ready, user } = useAuth();

  if (!ready) {
    return (
      <div className="grid h-full place-items-center text-muted">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route path="/" element={user ? <DashboardPage /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
