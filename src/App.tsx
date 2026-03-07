import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import CampusRadarPage from './pages/CampusRadarPage';

const ConnectionsPage = lazy(() => import('./pages/ConnectionsPage'));
const ConversationsPage = lazy(() => import('./pages/ConversationsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Analytics } from '@vercel/analytics/react';

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  if (!offline) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[500] bg-[var(--color-error)] text-white text-center text-xs font-semibold py-2 px-4 tracking-wide">
      No internet connection — reconnecting...
    </div>
  );
}

function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('gravity-install-dismissed') === 'true');
  const [isStandalone] = useState(() =>
    window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
  );

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
    setDismissed(true);
    localStorage.setItem('gravity-install-dismissed', 'true');
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('gravity-install-dismissed', 'true');
  };

  // Don't show if already installed, dismissed, or no prompt available
  // On iOS, show a manual instruction banner instead
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const showIOSBanner = isIOS && !isStandalone && !dismissed;
  const showAndroidBanner = !!deferredPrompt && !dismissed;

  if (!showIOSBanner && !showAndroidBanner) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 60 }}
      className="fixed bottom-20 left-4 right-4 z-[200] max-w-lg mx-auto"
    >
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-sand)] rounded-2xl shadow-xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-header)]">Add to Home Screen</p>
          <p className="text-[12px] text-[var(--color-text-secondary)]">
            {isIOS ? 'Tap Share → Add to Home Screen' : 'Install for the best experience'}
          </p>
        </div>
        {showAndroidBanner ? (
          <button onClick={handleInstall} className="btn-primary px-4 py-2 text-[11px] flex-shrink-0">
            Install
          </button>
        ) : (
          <button onClick={handleDismiss} className="text-[var(--color-steel-light)] p-1 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
        {showAndroidBanner && (
          <button onClick={handleDismiss} className="text-[var(--color-steel-light)] p-1 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    </motion.div>
  );
}

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
  const isChatDetail = location.pathname.startsWith('/chat/');
  const showNavbar = !isLanding && !isOnboarding && !isLogin && !isChatDetail && !!user;

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] font-sans text-[var(--color-text-primary)] overflow-x-hidden">
      <OfflineBanner />
      <AnimatePresence>{user && <InstallPrompt />}</AnimatePresence>
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
                  path="/chat"
                  element={
                    <ProtectedRoute>
                      <ConversationsPage />
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
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <AdminPage />
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
