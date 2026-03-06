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
import { motion, AnimatePresence } from 'motion/react';
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
  const isOnboarding = location.pathname === '/onboarding';
  const isLogin = location.pathname === '/login';
  const showNavbar = !isLanding && !isOnboarding && !isLogin && !!user;

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] font-sans text-[var(--color-text-primary)] overflow-x-hidden">
      {showNavbar && <Navbar />}
      <ErrorBoundary>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1"
          >
            <Suspense fallback={
              <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin mx-auto mb-3" />
                  <p className="text-sm text-[var(--color-text-secondary)]">Loading...</p>
                </div>
              </div>
            }>
              <Routes location={location}>
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
          </motion.div>
        </AnimatePresence>
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
