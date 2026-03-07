import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseService';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config/appConfig';
import logoUrl from '../assets/logo.png';
import { motion } from 'motion/react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, loading, enterDemoMode } = useAuth();

  useEffect(() => {
    if (user && !loading) navigate('/radar');
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError(null);
    setSending(true);

    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSending(false);
    if (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Wrong email or password. Try again or sign up.'
        : err.message);
    }
    // On success, onAuthStateChange fires and redirects via the useEffect above
  };

  const handleDemoLogin = () => {
    enterDemoMode();
    navigate('/onboarding');
  };

  if (loading || user) return null;

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 max-w-lg mx-auto w-full">
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 flex items-center justify-center text-[var(--color-steel-light)] hover:text-[var(--color-text-primary)] transition-colors rounded-lg"
          aria-label="Go back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="Gravity" className="w-7 h-7 rounded-full object-cover" />
          <span className="font-serif text-2xl text-[var(--color-text-header)]">{APP_CONFIG.APP_NAME}.</span>
        </div>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          <header className="text-center mb-10">
            <h1 className="font-serif text-3xl text-[var(--color-text-header)] mb-2">
              Welcome back
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Sign in to your account
            </p>
          </header>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="section-label block mb-2">Email</label>
              <input
                type="email"
                placeholder="name@company.com"
                className="input-field text-[16px]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label className="section-label block mb-2">Password</label>
              <input
                type="password"
                placeholder="Your password"
                className="input-field text-[16px]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                minLength={6}
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[var(--color-error)]/5 border border-[var(--color-error)]/15 px-4 py-3 rounded-[var(--radius-md)]"
              >
                <p className="text-[var(--color-error)] text-sm">{error}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={sending || !email.includes('@') || password.length < 6}
              className="btn-primary w-full py-4 text-sm"
            >
              {sending ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-[13px] text-[var(--color-text-secondary)]">
              Don't have an account?{' '}
              <button
                onClick={() => navigate('/onboarding')}
                className="text-[var(--color-primary)] font-semibold hover:underline"
              >
                Sign up
              </button>
            </p>
          </div>

          <div className="mt-6">
            <button
              onClick={handleDemoLogin}
              className="btn-secondary w-full py-3 text-xs flex items-center justify-center gap-2"
            >
              <span className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-gentle-pulse" />
              Try Demo Mode
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
