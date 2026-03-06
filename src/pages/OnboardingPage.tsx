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
  const { user, isDemo, enterDemoMode } = useAuth();
  const navigate = useNavigate();

  // PRD order: Step 1 Proximity, Step 2 Interests, Step 3 Profile, Step 4 Signup
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(0);

  // Step 1: Proximity
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // Step 2: Interests
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState('');

  // Step 3: Profile
  const [fullName, setFullName] = useState('');
  const [profession, setProfession] = useState('');
  const [company, setCompany] = useState('');
  const [intent, setIntent] = useState('');

  // Step 4: Signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);

  const totalSteps = user ? 3 : 4;
  const displayStep = user ? step : step;

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

  const removeInterest = (interest: string) => {
    setSelectedInterests((prev) => prev.filter((i) => i !== interest));
  };

  const handleBack = () => {
    if (step === 1) {
      navigate('/');
    } else {
      setDirection(-1);
      setStep(step - 1);
    }
  };

  const handleNext = async () => {
    setError(null);

    if (step === 1) {
      // Proximity — always valid
      setDirection(1);
      setStep(2);
    } else if (step === 2) {
      if (selectedInterests.length >= 3) {
        setDirection(1);
        setStep(3);
      } else {
        setError('Select at least 3 interests to continue.');
      }
    } else if (step === 3) {
      if (fullName.trim() && profession.trim()) {
        if (user || isDemo) {
          await handleSaveAndNavigate();
        } else {
          setDirection(1);
          setStep(4);
        }
      } else {
        setError('Name and profession are required.');
      }
    } else if (step === 4) {
      if (email.trim() && password.length >= 6) {
        await handleSaveAndNavigate();
      } else {
        setError('Enter a valid email and password (min 6 characters).');
      }
    }
  };

  const handleSaveAndNavigate = async () => {
    setSaving(true);
    setError(null);

    // Demo mode
    if (isDemo) {
      setDemoInterests(selectedInterests);
      setDemoProfile(fullName, profession, company, intent);
      setTimeout(() => navigate('/radar'), 300);
      return;
    }

    // Authenticated user updating profile
    if (user) {
      const { error: err } = await supabase.from('profiles').upsert({
        id: user.id, full_name: fullName, profession, company,
        interests: selectedInterests, intent,
        gps_enabled: gpsEnabled, notifications_enabled: notificationsEnabled,
        updated_at: new Date().toISOString(),
      });
      if (err) { setError(err.message); setSaving(false); return; }
      navigate('/radar');
      return;
    }

    // New user signup
    const { data, error: err } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, profession, company } },
    });
    if (err) { setError(err.message); setSaving(false); return; }

    if (data.user) {
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: data.user.id, full_name: fullName, profession, company,
        interests: selectedInterests, intent,
        gps_enabled: gpsEnabled, notifications_enabled: notificationsEnabled,
        updated_at: new Date().toISOString(),
      });
      if (profileErr) { setError(profileErr.message); setSaving(false); return; }
    }

    setSignupMessage('Check your email for a verification link.');
    setSaving(false);
  };

  const handleSkipToDemo = () => {
    enterDemoMode();
    if (selectedInterests.length >= 3) setDemoInterests(selectedInterests);
    if (fullName.trim()) setDemoProfile(fullName, profession, company, intent);
    navigate('/radar');
  };

  const canProceed = () => {
    if (step === 1) return true;
    if (step === 2) return selectedInterests.length >= 3;
    if (step === 3) return fullName.trim() && profession.trim();
    if (step === 4) return email.trim() && password.length >= 6;
    return false;
  };

  const stepLabel = () => {
    if (step === 1) return 'Interests';
    if (step === 2) return 'Profile';
    if (step === 3 && !user && !isDemo) return 'Create Account';
    return 'Radar';
  };

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir < 0 ? 40 : -40, opacity: 0 }),
  };

  return (
    <div className="min-h-screen bg-[--color-bg-warm] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 max-w-lg mx-auto w-full">
        <button
          onClick={handleBack}
          className="w-10 h-10 flex items-center justify-center text-[--color-steel-light] hover:text-[--color-text-primary] transition-colors rounded-lg"
          aria-label="Go back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <span className="font-serif text-2xl text-[--color-text-header]">{APP_CONFIG.APP_NAME}.</span>
        <div className="w-10" />
      </div>

      {/* Progress */}
      <div className="px-6 pb-5 max-w-lg mx-auto w-full">
        <p className="section-label mb-3">Step {displayStep} of {totalSteps}</p>
        <div className="flex gap-1.5">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-full transition-all duration-500 ${
                i < step ? 'bg-[--color-primary]' : 'bg-[--color-sand]'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="px-6 pt-2 pb-36 max-w-lg mx-auto w-full overflow-y-auto content-container"
            style={{ minHeight: 0 }}
          >
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[--color-error]/5 border border-[--color-error]/15 px-4 py-3 rounded-[--radius-md] mb-6"
              >
                <p className="text-[--color-error] text-sm">{error}</p>
              </motion.div>
            )}

            {/* Step 1: Proximity */}
            {step === 1 && (
              <div>
                <h1 className="font-serif text-3xl text-[--color-text-header] mb-2">Proximity</h1>
                <p className="text-sm text-[--color-text-secondary] mb-8">
                  Enable location detection for {APP_CONFIG.LOCATION_NAME}
                </p>

                <div className="space-y-3">
                  {[
                    { label: 'GPS Location', desc: 'Detect proximity to the building', value: gpsEnabled, toggle: () => setGpsEnabled(!gpsEnabled) },
                    { label: 'Notifications', desc: 'Get notified on connection requests', value: notificationsEnabled, toggle: () => setNotificationsEnabled(!notificationsEnabled) },
                  ].map((item, i) => (
                    <div
                      key={item.label}
                      className="card flex items-center justify-between p-5 animate-fade-in"
                      style={{ animationDelay: `${i * 0.1}s` }}
                    >
                      <div>
                        <p className="font-semibold text-[--color-text-primary] text-[15px]">{item.label}</p>
                        <p className="text-[13px] text-[--color-text-secondary] mt-0.5">{item.desc}</p>
                      </div>
                      <button
                        onClick={item.toggle}
                        className={`relative w-12 h-7 rounded-full transition-colors duration-200 flex-shrink-0 ml-4 ${item.value ? 'bg-[--color-primary]' : 'bg-[--color-sand]'}`}
                        aria-label={`Toggle ${item.label}`}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-200 ${item.value ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  ))}
                </div>

                <p className="text-[13px] text-[--color-text-secondary] mt-6 text-center italic">
                  Your exact location is never shared — only proximity.
                </p>
              </div>
            )}

            {/* Step 2: Interests */}
            {step === 2 && (
              <div>
                <h1 className="font-serif text-3xl text-[--color-text-header] mb-2">Interests</h1>
                <p className="text-sm text-[--color-text-secondary] mb-8">
                  Select 3–10 topics that define your work
                </p>

                {/* Custom input */}
                <div className="relative mb-6">
                  <input
                    type="text"
                    placeholder="Add a custom interest..."
                    className="input-field pr-14"
                    value={customInterest}
                    onChange={(e) => setCustomInterest(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomInterest())}
                  />
                  <button
                    onClick={addCustomInterest}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-[--color-primary] text-white rounded-lg flex items-center justify-center hover:bg-[--color-primary-dark] transition-colors"
                    aria-label="Add custom interest"
                    type="button"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                </div>

                {/* Suggestions */}
                <div className="flex flex-wrap gap-2 mb-8">
                  {INTEREST_SUGGESTIONS.map((interest, i) => {
                    const sel = selectedInterests.includes(interest);
                    return (
                      <button
                        key={interest}
                        type="button"
                        onClick={() => toggleInterest(interest)}
                        disabled={!sel && selectedInterests.length >= MAX_INTERESTS}
                        className={`px-4 py-2.5 rounded-full text-[13px] font-medium border transition-all animate-fade-in ${
                          sel
                            ? 'bg-[--color-primary] border-[--color-primary] text-white'
                            : 'bg-white border-[--color-sand] text-[--color-text-primary] hover:border-[--color-primary-light] disabled:opacity-40'
                        }`}
                        style={{ animationDelay: `${i * 0.02}s` }}
                      >
                        {interest}
                      </button>
                    );
                  })}
                </div>

                {/* Selected */}
                <AnimatePresence>
                  {selectedInterests.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-[--color-sand] pt-5"
                    >
                      <p className="section-label mb-3">
                        Selected ({selectedInterests.length}/{MAX_INTERESTS})
                        {selectedInterests.length < 3 && (
                          <span className="text-[--color-primary] ml-2">
                            {3 - selectedInterests.length} more needed
                          </span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedInterests.map((interest) => (
                          <motion.span
                            layout
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            key={interest}
                            className="inline-flex items-center gap-1.5 bg-[--color-primary]/10 text-[--color-primary-dark] px-3 py-1.5 rounded-full text-[13px] font-medium border border-[--color-primary]/15"
                          >
                            {interest}
                            <button
                              type="button"
                              onClick={() => removeInterest(interest)}
                              className="hover:text-[--color-error] transition-colors"
                              aria-label={`Remove ${interest}`}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                          </motion.span>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Step 3: Profile */}
            {step === 3 && (
              <div>
                <h1 className="font-serif text-3xl text-[--color-text-header] mb-2">Profile</h1>
                <p className="text-sm text-[--color-text-secondary] mb-8">
                  How you appear on the radar
                </p>

                <div className="space-y-5">
                  <div className="animate-fade-in" style={{ animationDelay: '0.05s' }}>
                    <label className="section-label block mb-2">Full Name *</label>
                    <input type="text" placeholder="Your name" className="input-field" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
                    <label className="section-label block mb-2">Profession *</label>
                    <input type="text" placeholder="e.g. Software Engineer, UX Designer" className="input-field" value={profession} onChange={(e) => setProfession(e.target.value)} />
                  </div>
                  <div className="animate-fade-in" style={{ animationDelay: '0.15s' }}>
                    <label className="section-label block mb-2">Company</label>
                    <input type="text" placeholder="Organization (optional)" className="input-field" value={company} onChange={(e) => setCompany(e.target.value)} />
                  </div>
                  <div className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
                    <label className="section-label block mb-2">Intent</label>
                    <textarea
                      placeholder="What are you looking for? (optional)"
                      className="input-field min-h-[80px] resize-none"
                      value={intent}
                      onChange={(e) => setIntent(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Signup */}
            {step === 4 && (
              <div>
                <h1 className="font-serif text-3xl text-[--color-text-header] mb-2">Create your account</h1>
                <p className="text-sm text-[--color-text-secondary] mb-8">
                  We'll send a verification link to your email.
                </p>

                {signupMessage ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="card p-8 text-center"
                  >
                    <div className="w-14 h-14 bg-[--color-success]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                    </div>
                    <h3 className="font-serif text-xl text-[--color-text-header] mb-2">Check your inbox</h3>
                    <p className="text-sm text-[--color-text-secondary]">{signupMessage}</p>
                  </motion.div>
                ) : (
                  <div className="space-y-5">
                    <div className="animate-fade-in" style={{ animationDelay: '0.05s' }}>
                      <label className="section-label block mb-2">Email</label>
                      <input
                        type="email"
                        placeholder="name@company.com"
                        className="input-field"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </div>
                    <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
                      <label className="section-label block mb-2">Password</label>
                      <input
                        type="password"
                        placeholder="Min 6 characters"
                        className="input-field"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>

                    <div className="pt-4 text-center">
                      <button
                        type="button"
                        onClick={handleSkipToDemo}
                        className="text-[13px] text-[--color-text-secondary] hover:text-[--color-primary] transition-colors"
                      >
                        Skip — try Demo Mode instead
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sticky Bottom Button */}
      {!signupMessage && (
        <div className="fixed bottom-0 left-0 right-0 glass-effect border-t border-[--color-sand]/60 px-6 py-5 safe-bottom z-50">
          <div className="max-w-lg mx-auto">
            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceed() || saving}
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
              ) : step === totalSteps ? (
                user || isDemo ? 'Continue to Radar' : 'Create Account'
              ) : (
                `Continue`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
