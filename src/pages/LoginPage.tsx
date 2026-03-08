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
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);
  const navigate = useNavigate();
  const { user, loading, enterDemoMode, needsPasswordSetup, setNeedsPasswordSetup } = useAuth();

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

  const handleResetPassword = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Enter your email address first.');
      return;
    }
    setError(null);
    setSending(true);
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setSending(false);
    if (resetErr) {
      setError(resetErr.message);
    } else {
      setResetSent(true);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setError(null);
    setSending(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    setSending(false);
    if (updateErr) { setError(updateErr.message); return; }
    setNeedsPasswordSetup(false);
    setPasswordSet(true);
    setTimeout(() => navigate('/radar'), 1500);
  };

  const handleDemoLogin = () => {
    enterDemoMode();
    navigate('/onboarding');
  };

  if (loading) return null;
  if (user && !needsPasswordSetup) return null;

  // Password setup screen for users arriving via magic link / password recovery
  if (needsPasswordSetup) {
    return (
      <div className="min-h-screen bg-[#0D0B09] flex flex-col">
        <div className="flex items-center justify-center px-6 py-5">
          <div className="flex items-center gap-2">
            <img src={logoUrl} alt="Gravity" className="w-7 h-7 rounded-full object-cover" />
            <span className="font-serif text-2xl text-[var(--color-text-header)]">{APP_CONFIG.APP_NAME}.</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-sm"
          >
            {passwordSet ? (
              <div className="text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </div>
                <h1 className="font-serif text-2xl text-[var(--color-text-header)] mb-2">Password set!</h1>
                <p className="text-sm text-[var(--color-text-secondary)]">Redirecting you now...</p>
              </div>
            ) : (
              <>
                <header className="text-center mb-10">
                  <h1 className="font-serif text-3xl text-[var(--color-text-header)] mb-2">Set your password</h1>
                  <p className="text-sm text-[var(--color-text-secondary)]">Create a password so you can log in anytime</p>
                </header>
                <form onSubmit={handleSetPassword} className="space-y-4">
                  <div>
                    <label className="section-label block mb-2">New Password</label>
                    <input
                      type="password"
                      placeholder="At least 6 characters"
                      className="input-field text-[16px]"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      minLength={6}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="section-label block mb-2">Confirm Password</label>
                    <input
                      type="password"
                      placeholder="Re-enter your password"
                      className="input-field text-[16px]"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
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
                    disabled={sending || newPassword.length < 6}
                    className="btn-primary w-full py-4 text-sm"
                  >
                    {sending ? 'Setting password...' : 'Set Password'}
                  </button>
                </form>
              </>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D0B09] flex flex-col">
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

            {!showReset && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="section-label">Password</label>
                  <button
                    type="button"
                    onClick={() => { setShowReset(true); setError(null); setResetSent(false); }}
                    className="text-[11px] font-semibold text-[var(--color-primary)] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
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
            )}

            {showReset && (
              <div className="bg-[var(--color-mist)] border border-[var(--color-sand)] rounded-2xl p-4">
                {resetSent ? (
                  <div className="text-center py-2">
                    <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    </div>
                    <p className="text-sm font-medium text-[var(--color-text-header)] mb-1">Check your email</p>
                    <p className="text-[13px] text-[var(--color-text-secondary)]">We sent a reset link to {email}</p>
                    <button
                      type="button"
                      onClick={() => { setShowReset(false); setResetSent(false); }}
                      className="mt-3 text-[12px] font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      Back to login
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-[var(--color-text-primary)] mb-3">Enter your email and we'll send a reset link.</p>
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      disabled={sending || !email.includes('@')}
                      className="btn-primary w-full py-3 text-xs"
                    >
                      {sending ? 'Sending...' : 'Send Reset Link'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReset(false)}
                      className="w-full mt-2 text-center text-[12px] text-[var(--color-steel-light)] hover:text-[var(--color-text-primary)] transition-colors py-1"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[var(--color-error)]/5 border border-[var(--color-error)]/15 px-4 py-3 rounded-[var(--radius-md)]"
              >
                <p className="text-[var(--color-error)] text-sm">{error}</p>
              </motion.div>
            )}

            {!showReset && (
              <button
                type="submit"
                disabled={sending || !email.includes('@') || password.length < 6}
                className="btn-primary w-full py-4 text-sm"
              >
                {sending ? 'Signing in...' : 'Sign In'}
              </button>
            )}
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
