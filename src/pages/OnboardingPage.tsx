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

  const [step, setStep] = useState(1);
  const totalSteps = 3;

  // Step 1: Profile + credentials
  const [fullName, setFullName] = useState('');
  const [profession, setProfession] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Step 2: Interests
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState('');

  // Step 3: Intent
  const [intent, setIntent] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const canAdvance = () => {
    if (step === 1) {
      if (!fullName.trim() || !profession.trim()) return false;
      if (!isAuthenticated && !isDemo) {
        if (!email.trim() || !email.includes('@')) return false;
        if (password.length < 6) return false;
      }
      return true;
    }
    if (step === 2) return selectedInterests.length >= 3;
    return true;
  };

  const handleNext = () => {
    if (step < totalSteps && canAdvance()) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else navigate('/');
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);

    // Demo mode
    if (isDemo) {
      setDemoInterests(selectedInterests);
      setDemoProfile(fullName, profession, company, intent);
      setNeedsOnboarding(false);
      navigate('/radar');
      return;
    }

    const profileData = {
      full_name: fullName,
      profession,
      company,
      interests: selectedInterests,
      intent,
      consent_given_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Already authenticated — just save profile
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

    // New user: create account with email + password, then save profile
    // Store profile in sessionStorage so AuthContext can apply it after signup
    sessionStorage.setItem('gravity_pending_profile', JSON.stringify(profileData));

    const { error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/radar`,
        data: { full_name: fullName },
      },
    });

    if (signUpErr) {
      // If user already exists, try signing in instead
      if (signUpErr.message?.includes('already registered') || signUpErr.message?.includes('already been registered')) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) {
          setError('Account exists. Check your password or log in instead.');
          setSaving(false);
          return;
        }
        // signIn success — onAuthStateChange will handle profile upsert and redirect
        return;
      }
      setError(signUpErr.message);
      setSaving(false);
      return;
    }

    // signUp succeeded — Supabase may auto-confirm or require email confirmation
    // depending on project settings. Try to sign in immediately.
    const { error: autoSignInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (autoSignInErr) {
      // Email confirmation required
      setError('Almost there! Check your inbox for a confirmation link, then log in.');
      setSaving(false);
      return;
    }
    // Auto sign-in worked — onAuthStateChange handles the rest
  };

  const handleDemoMode = () => {
    enterDemoMode();
    if (selectedInterests.length >= 3) setDemoInterests(selectedInterests);
    if (fullName.trim()) setDemoProfile(fullName, profession, company, intent);
    navigate('/radar');
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] flex flex-col">
      {/* Top bar: back arrow + brand */}
      <div className="flex items-center justify-between px-6 py-5 max-w-lg mx-auto w-full">
        <button
          onClick={handleBack}
          className="w-10 h-10 flex items-center justify-center text-[var(--color-steel-light)] hover:text-[var(--color-text-primary)] transition-colors rounded-lg"
          aria-label="Go back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <span className="font-serif text-xl text-[var(--color-primary)]">{APP_CONFIG.APP_NAME}.</span>
        <div className="w-10" />
      </div>

      {/* Progress bar */}
      <div className="px-6 max-w-lg mx-auto w-full mb-6">
        <p className="section-label mb-2">Step {step} of {totalSteps}</p>
        <div className="h-1 bg-[var(--color-sand)] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-[var(--color-primary)] rounded-full"
            initial={false}
            animate={{ width: `${(step / totalSteps) * 100}%` }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-32 max-w-lg mx-auto w-full overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* Step 1: Tell us about yourself */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="font-serif text-3xl text-[var(--color-text-header)] mb-8">
                Tell us about yourself
              </h1>

              {error && (
                <div className="bg-[var(--color-error)]/5 border border-[var(--color-error)]/15 px-4 py-3 rounded-[var(--radius-md)] mb-6">
                  <p className="text-[var(--color-error)] text-sm">{error}</p>
                </div>
              )}

              {/* Email + Password (only for unauthenticated) */}
              {!isAuthenticated && !isDemo && (
                <>
                  <div className="mb-5">
                    <label className="section-label block mb-2">Email</label>
                    <input
                      type="email"
                      placeholder="name@company.com"
                      className="input-field"
                      value={email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                  <div className="mb-5">
                    <label className="section-label block mb-2">Password</label>
                    <input
                      type="password"
                      placeholder="Min 6 characters"
                      className="input-field"
                      value={password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                    />
                  </div>
                </>
              )}

              <div className="mb-5">
                <label className="section-label block mb-2">Full Name</label>
                <input
                  type="text"
                  placeholder="Your name"
                  className="input-field"
                  value={fullName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFullName(e.target.value)}
                  autoFocus={isAuthenticated}
                />
              </div>

              <div className="mb-5">
                <label className="section-label block mb-2">Headline</label>
                <input
                  type="text"
                  placeholder="e.g. UX Designer"
                  className="input-field"
                  value={profession}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfession(e.target.value)}
                />
              </div>

              <div className="mb-5">
                <label className="section-label block mb-2">Company</label>
                <input
                  type="text"
                  placeholder="Optional"
                  className="input-field"
                  value={company}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCompany(e.target.value)}
                />
              </div>
            </motion.div>
          )}

          {/* Step 2: Interests */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="font-serif text-3xl text-[var(--color-text-header)] mb-8">
                Interests
              </h1>

              {/* Custom input */}
              <div className="flex gap-2 mb-5">
                <input
                  type="text"
                  placeholder="Add custom interest..."
                  className="input-field flex-1"
                  value={customInterest}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomInterest(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && (e.preventDefault(), addCustomInterest())}
                />
                <button
                  onClick={addCustomInterest}
                  type="button"
                  className="btn-primary px-5 py-3 text-xs"
                >
                  Add
                </button>
              </div>

              {/* Suggestions */}
              <p className="section-label mb-3">Suggestions</p>
              <div className="flex flex-wrap gap-2 mb-6">
                {INTEREST_SUGGESTIONS.map((interest) => {
                  const sel = selectedInterests.includes(interest);
                  return (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => toggleInterest(interest)}
                      disabled={!sel && selectedInterests.length >= MAX_INTERESTS}
                      className={`px-3.5 py-2 rounded-full text-[12px] font-medium border transition-all ${
                        sel
                          ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                          : 'bg-[var(--color-bg-card)] border-[var(--color-sand)] text-[var(--color-text-primary)] hover:border-[var(--color-primary-light)] disabled:opacity-40'
                      }`}
                    >
                      {sel ? (
                        <span className="flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                          {interest}
                        </span>
                      ) : (
                        <span>+ {interest}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected count */}
              <p className="section-label mb-2">
                Selected ({selectedInterests.length}/{MAX_INTERESTS})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedInterests.map((interest) => (
                  <span
                    key={interest}
                    className="inline-flex items-center gap-1.5 bg-[var(--color-primary)]/8 text-[var(--color-primary-dark)] px-3 py-1.5 rounded-full text-[12px] font-medium border border-[var(--color-primary)]/10"
                  >
                    {interest}
                    <button
                      type="button"
                      onClick={() => toggleInterest(interest)}
                      className="hover:text-[var(--color-error)] transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </span>
                ))}
                {selectedInterests.length === 0 && (
                  <p className="text-sm text-[var(--color-text-secondary)] italic">Pick at least 3 interests above</p>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3: Intent */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="font-serif text-3xl text-[var(--color-text-header)] mb-2">
                Intent
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)] mb-8">
                Who are you looking to connect with?
              </p>

              <textarea
                className="input-field min-h-[140px] resize-none mb-6"
                placeholder="e.g. Seeking co-founders, hiring AI engineers..."
                value={intent}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setIntent(e.target.value)}
                autoFocus
              />

              {error && (
                <div className="bg-[var(--color-error)]/5 border border-[var(--color-error)]/15 px-4 py-3 rounded-[var(--radius-md)] mb-6">
                  <p className="text-[var(--color-error)] text-sm">{error}</p>
                </div>
              )}

              <div className="bg-[var(--color-mist)] border border-[var(--color-sand)] rounded-2xl px-4 py-3.5 flex items-start gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                  Sharing your distance enables serendipity. Your exact location is never shared.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 glass-effect border-t border-[var(--color-sand)]/60 px-6 py-5 safe-bottom z-50">
        <div className="max-w-lg mx-auto flex flex-col gap-3">
          {step < totalSteps ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canAdvance()}
              className="btn-primary w-full py-4 text-sm"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="btn-primary w-full py-4 text-sm flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating account...
                </>
              ) : isAuthenticated ? (
                'Start exploring'
              ) : (
                'Create account'
              )}
            </button>
          )}

          {step === 2 && selectedInterests.length < 3 && (
            <p className="text-center text-[11px] text-[var(--color-text-secondary)]">
              Pick {3 - selectedInterests.length} more interest{3 - selectedInterests.length !== 1 ? 's' : ''} to continue
            </p>
          )}

          {step === 1 && !isAuthenticated && (
            <button
              type="button"
              onClick={handleDemoMode}
              className="text-center text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors py-1"
            >
              Just exploring? Try Demo Mode
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
