import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { setDemoInterests, setDemoProfile } from '../services/mockData';
import { APP_CONFIG } from '../config/appConfig';
import { motion, AnimatePresence } from 'motion/react';

const INTEREST_SUGGESTIONS = [
  'Sustainability', 'UX Design', 'Manufacturing', 'Health Tech',
  'EdTech', 'E-commerce', 'Robotics', 'SaaS', 'Marketing',
  'Supply Chain', 'Cybersecurity', 'IoT', 'Gaming',
  'Real Estate Tech', 'Food Tech', 'Mobility', 'Creative Arts',
];

const MAX_INTERESTS = 10;

export default function OnboardingPage() {
  const { user, isDemo, enterDemoMode, setNeedsOnboarding } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [profession, setProfession] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState('');
  const [email, setEmail] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // If user is already authenticated, show single-screen setup (invited users)
  const isAuthenticated = !!user && !isDemo;

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) => {
      if (prev.includes(interest)) return prev.filter((i) => i !== interest);
      if (prev.length >= MAX_INTERESTS) return prev;
      return [...prev, interest];
    });
  };

  const addCustomInterest = () => {
    const trimmed = customInterest.trim();
    if (!trimmed || selectedInterests.includes(trimmed) || selectedInterests.length >= MAX_INTERESTS) return;
    setSelectedInterests((prev) => [...prev, trimmed]);
    setCustomInterest('');
  };

  const canSubmit = () => {
    if (selectedInterests.length < 3) return false;
    if (!fullName.trim() || !profession.trim()) return false;
    if (!isAuthenticated && !isDemo && (!email.trim() || !email.includes('@'))) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit()) return;
    setSaving(true);
    setError(null);

    // Demo mode
    if (isDemo) {
      setDemoInterests(selectedInterests);
      setDemoProfile(fullName, profession, '', '');
      setNeedsOnboarding(false);
      navigate('/radar');
      return;
    }

    const profileData = {
      full_name: fullName,
      profession,
      interests: selectedInterests,
      consent_given_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Already authenticated (came via invite magic link)
    if (isAuthenticated && user) {
      const { error: err } = await supabase.from('profiles').upsert({
        id: user.id,
        ...profileData,
      });
      if (err) { setError(err.message); setSaving(false); return; }
      setNeedsOnboarding(false);
      navigate('/radar');
      return;
    }

    // New user: send magic link, save profile to sessionStorage for after redirect
    sessionStorage.setItem('gravity_pending_profile', JSON.stringify(profileData));
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/radar`,
        shouldCreateUser: true,
      },
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setMagicLinkSent(true);
    setSaving(false);
  };

  const handleDemoMode = () => {
    enterDemoMode();
    if (selectedInterests.length >= 3) setDemoInterests(selectedInterests);
    if (fullName.trim()) setDemoProfile(fullName, profession, '', '');
    navigate('/radar');
  };

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
        <span className="font-serif text-2xl text-[var(--color-text-header)]">{APP_CONFIG.APP_NAME}.</span>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-32 max-w-lg mx-auto w-full overflow-y-auto">
        {magicLinkSent ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-10 text-center mt-8"
          >
            <div className="w-16 h-16 bg-[var(--color-success)]/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            </div>
            <h3 className="font-serif text-2xl text-[var(--color-text-header)] mb-2">Check your inbox</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-1">
              We sent a magic link to <strong>{email}</strong>
            </p>
            <p className="text-[13px] text-[var(--color-text-secondary)]">
              Click it to jump straight into the radar. No password needed.
            </p>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <header className="mb-8">
              <h1 className="font-serif text-3xl text-[var(--color-text-header)] mb-2">
                {isAuthenticated ? 'Quick setup' : 'Join the radar'}
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {isAuthenticated
                  ? 'Tell us about yourself so we can match you with the right people.'
                  : 'One minute to set up, then you\'re in.'}
              </p>
            </header>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[var(--color-error)]/5 border border-[var(--color-error)]/15 px-4 py-3 rounded-[var(--radius-md)] mb-6"
              >
                <p className="text-[var(--color-error)] text-sm">{error}</p>
              </motion.div>
            )}

            {/* Email (only for unauthenticated users) */}
            {!isAuthenticated && !isDemo && (
              <div className="mb-6">
                <label className="section-label block mb-2">Email</label>
                <input
                  type="email"
                  placeholder="name@company.com"
                  className="input-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>
            )}

            {/* Name + Profession */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div>
                <label className="section-label block mb-2">Name *</label>
                <input
                  type="text"
                  placeholder="Your name"
                  className="input-field"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoFocus={isAuthenticated}
                />
              </div>
              <div>
                <label className="section-label block mb-2">Role *</label>
                <input
                  type="text"
                  placeholder="e.g. Designer"
                  className="input-field"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                />
              </div>
            </div>

            {/* Interests */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="section-label">Pick 3+ interests</label>
                {selectedInterests.length > 0 && (
                  <span className={`text-[11px] font-semibold ${selectedInterests.length >= 3 ? 'text-[var(--color-success)]' : 'text-[var(--color-primary)]'}`}>
                    {selectedInterests.length}/{MAX_INTERESTS}
                  </span>
                )}
              </div>

              {/* Custom input */}
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="Add a custom interest..."
                  className="input-field pr-14 text-[14px]"
                  value={customInterest}
                  onChange={(e) => setCustomInterest(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomInterest())}
                />
                <button
                  onClick={addCustomInterest}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-[var(--color-primary)] text-white rounded-lg flex items-center justify-center hover:bg-[var(--color-primary-dark)] transition-colors"
                  aria-label="Add"
                  type="button"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>

              {/* Suggestion chips */}
              <div className="flex flex-wrap gap-1.5">
                {INTEREST_SUGGESTIONS.map((interest) => {
                  const sel = selectedInterests.includes(interest);
                  return (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => toggleInterest(interest)}
                      disabled={!sel && selectedInterests.length >= MAX_INTERESTS}
                      className={`px-3 py-2 rounded-full text-[12px] font-medium border transition-all ${
                        sel
                          ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                          : 'bg-white border-[var(--color-sand)] text-[var(--color-text-primary)] hover:border-[var(--color-primary-light)] disabled:opacity-40'
                      }`}
                    >
                      {interest}
                    </button>
                  );
                })}
              </div>

              {/* Selected custom interests (non-suggestion) */}
              <AnimatePresence>
                {selectedInterests.filter((i) => !INTEREST_SUGGESTIONS.includes(i)).length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-1.5 mt-3">
                    {selectedInterests.filter((i) => !INTEREST_SUGGESTIONS.includes(i)).map((interest) => (
                      <motion.span
                        layout
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        key={interest}
                        className="inline-flex items-center gap-1 bg-[var(--color-primary)]/10 text-[var(--color-primary-dark)] px-3 py-1.5 rounded-full text-[12px] font-medium border border-[var(--color-primary)]/15"
                      >
                        {interest}
                        <button
                          type="button"
                          onClick={() => toggleInterest(interest)}
                          className="hover:text-[var(--color-error)] transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                      </motion.span>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Demo mode link */}
            {!isAuthenticated && (
              <div className="text-center mb-2">
                <button
                  type="button"
                  onClick={handleDemoMode}
                  className="text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors"
                >
                  Just exploring? Try Demo Mode
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Sticky submit */}
      {!magicLinkSent && (
        <div className="fixed bottom-0 left-0 right-0 glass-effect border-t border-[var(--color-sand)]/60 px-6 py-5 safe-bottom z-50">
          <div className="max-w-lg mx-auto">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit() || saving}
              className="btn-primary w-full py-4 text-sm flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {isAuthenticated ? 'Saving...' : 'Sending link...'}
                </>
              ) : isAuthenticated ? (
                'Start exploring'
              ) : (
                'Get magic link'
              )}
            </button>
            {!isAuthenticated && selectedInterests.length < 3 && (
              <p className="text-center text-[11px] text-[var(--color-text-secondary)] mt-2">
                Pick {3 - selectedInterests.length} more interest{3 - selectedInterests.length !== 1 ? 's' : ''} to continue
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
