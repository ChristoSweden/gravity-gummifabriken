import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import CampusRadarPage from './pages/CampusRadarPage';

const ConnectionsPage = lazy(() => import('./pages/ConnectionsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));

import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Analytics } from '@vercel/analytics/react';

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
      <ErrorBoundary>
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center">
            <div className="animate-pulse font-brand text-xl text-[--color-primary]">Loading Gravity...</div>
          </div>
        }>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
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
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppLayout />
      <Analytics />
    </AuthProvider>
  );
}
