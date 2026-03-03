import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OnboardingPage from './pages/OnboardingPage';
import CampusRadarPage from './pages/CampusRadarPage';
import ConnectionsPage from './pages/ConnectionsPage';
import ProfilePage from './pages/ProfilePage';
import ChatPage from './pages/ChatPage';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/radar" replace /> : <LandingPage />;
}

function AppLayout() {
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const { user } = useAuth();
  const showNavbar = isLanding ? false : !!user;

  return (
    <div className="min-h-screen bg-[--color-bg-warm] font-sans text-[--color-text-primary]">
      {showNavbar && <Navbar />}
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/radar"
          element={
            <ProtectedRoute>
              <CampusRadarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/connections"
          element={
            <ProtectedRoute>
              <ConnectionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat/:userId"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route path="/home" element={<Navigate to="/radar" replace />} />
        <Route path="/discovery" element={<Navigate to="/radar" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppLayout />
    </AuthProvider>
  );
}
