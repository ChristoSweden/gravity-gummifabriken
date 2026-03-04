import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { setDemoInterests, setDemoProfile } from '../services/mockData';

const INTEREST_SUGGESTIONS = [
  'Strategic Planning', 'Data Analysis', 'Project Management',
  'Process Optimization', 'Digital Transformation', 'Leadership Development',
  'Business Strategy', 'Innovation Management', 'Stakeholder Engagement',
  'Change Management', 'AI / Machine Learning', 'Sustainability',
  'UX Design', 'Manufacturing', 'Fintech', 'Health Tech',
  'EdTech', 'E-commerce', 'Robotics', 'Clean Energy',
  'SaaS', 'Marketing', 'Supply Chain', 'Cybersecurity',
  'IoT', 'Creative Arts',
];

const MAX_INTERESTS = 10;

export default function OnboardingPage() {
  const { user, isDemo, enterDemoMode } = useAuth();
  const navigate = useNavigate();

  // Step 1 = Proximity, Step 2 = Interests, Step 3 = Profile, Step 4 = Signup
  const [step, setStep] = useState(1);

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

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) => {
      if (prev.includes(interest)) return prev.filter((i: string) => i !== interest);
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
    setSelectedInterests((prev) => prev.filter((i: string) => i !== interest));
  };

  const handleBack = () => {
    if (step === 1) navigate('/');
    else setStep(step - 1);
  };

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2 && selectedInterests.length >= 3) {
      setStep(3);
    } else if (step === 3 && fullName.trim() && profession.trim()) {
      if (user) {
        handleSaveAndNavigate();
      } else {
        setStep(4);
      }
    }
  };

  const handleSaveAndNavigate = async () => {
    setSaving(true);
    setError(null);
    if (isDemo) {
      setDemoInterests(selectedInterests);
      setDemoProfile(fullName, profession, company);
      setTimeout(() => navigate('/radar'), 400);
      return;
    }
    if (!user) return;
    const { error: err } = await supabase.from('profiles').upsert({
      id: user.id, full_name: fullName, profession: profession, company,
      interests: selectedInterests, intent,
      gps_enabled: gpsEnabled, notifications_enabled: notificationsEnabled,
      updated_at: new Date().toISOString(),
    });
    if (err) { setError(err.message); setSaving(false); return; }
    navigate('/radar');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null); setSignupMessage(null);
    const { data, error: err } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, profession: profession, company } },
    });
    if (err) { setError(err.message); setSaving(false); return; }
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id, full_name: fullName, profession: profession, company,
        interests: selectedInterests, intent,
        gps_enabled: gpsEnabled, notifications_enabled: notificationsEnabled,
        updated_at: new Date().toISOString(),
      });
    }
    setSignupMessage('Account created! Check your email to verify, then you\'ll land on the radar.');
    setSaving(false);
  };

  const handleSkipToDemo = () => {
    enterDemoMode();
    if (selectedInterests.length >= 3) setDemoInterests(selectedInterests);
    if (fullName.trim()) setDemoProfile(fullName, profession, company);
    navigate('/radar');
  };

  const canProceed = () => {
    if (step === 1) return true;
    if (step === 2) return selectedInterests.length >= 3;
    if (step === 3) return fullName.trim() && profession.trim();
    return false;
  };

  // Shared styles
  const copper = '#B87333';
  const accent = '#C88B4A';
  const steel = '#4A4A4A';
  const mist = '#EDE8E0';
  const cream = '#F9F5F0';
  const dark = '#1A1A1A';

  const inputStyle: React.CSSProperties = {
    border: `1px solid ${mist}`, color: steel, backgroundColor: '#fff',
    width: '100%', padding: '14px', borderRadius: '12px', outline: 'none',
    fontSize: '15px',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 700, color: steel,
    textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '8px',
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: cream }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px', maxWidth: '480px', margin: '0 auto', width: '100%' }}>
        <button onClick={handleBack} style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', color: steel }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', fontWeight: 700, color: copper }}>Gravity.</span>
      </div>

      {/* Step indicator */}
      <div style={{ flexShrink: 0, padding: '0 16px 16px', maxWidth: '480px', margin: '0 auto', width: '100%' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: steel, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
          Step {step} of {totalSteps}
        </p>
        <div style={{ display: 'flex', gap: '6px' }}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} style={{ flex: 1, height: '4px', borderRadius: '4px', backgroundColor: i < step ? copper : mist, transition: 'background-color 0.3s' }} />
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', width: '100%' }}>

          {/* STEP 1: Proximity */}
          {step === 1 && (
            <>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', fontWeight: 700, color: dark, marginBottom: '24px' }}>
                Proximity Settings
              </h1>

              <p style={{ fontSize: '14px', color: steel, marginBottom: '24px', lineHeight: 1.5 }}>
                Default GPS and notifications of incoming requests are automatically activated when in the proximity of the building.
              </p>

              {/* Privacy note */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px', borderRadius: '12px', backgroundColor: 'rgba(184,115,51,0.06)', border: '1px solid rgba(184,115,51,0.12)', marginBottom: '24px' }}>
                <svg style={{ width: 20, height: 20, color: copper, flexShrink: 0, marginTop: 2 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <p style={{ fontSize: '14px', color: steel }}>Sharing your distance enables serendipity. Your exact location is never shared.</p>
              </div>

              {/* Proximity toggles */}
              {[
                { label: 'GPS Location', desc: "Detect when you're near Gummifabriken", value: gpsEnabled, toggle: () => setGpsEnabled(!gpsEnabled) },
                { label: 'Notifications', desc: 'Get notified when someone wants to connect', value: notificationsEnabled, toggle: () => setNotificationsEnabled(!notificationsEnabled) },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: '#fff', borderRadius: '12px', border: `1px solid ${mist}`, marginBottom: '12px' }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '14px', color: dark }}>{item.label}</p>
                    <p style={{ fontSize: '12px', color: steel, opacity: 0.7, marginTop: 2 }}>{item.desc}</p>
                  </div>
                  <button onClick={item.toggle} style={{ position: 'relative', width: 48, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', backgroundColor: item.value ? copper : '#d1d5db', transition: 'background-color 0.2s', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 2, left: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'transform 0.2s', transform: item.value ? 'translateX(20px)' : 'translateX(0)' }} />
                  </button>
                </div>
              ))}
            </>
          )}

          {/* STEP 2: Interests */}
          {step === 2 && (
            <>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', fontWeight: 700, color: dark, marginBottom: '24px' }}>
                Interests
              </h1>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <input
                  type="text" placeholder="Add custom interest..."
                  style={{ ...inputStyle, flex: 1 }}
                  value={customInterest}
                  onChange={(e) => setCustomInterest(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomInterest())}
                  disabled={selectedInterests.length >= MAX_INTERESTS}
                />
                <button
                  onClick={addCustomInterest}
                  disabled={!customInterest.trim() || selectedInterests.length >= MAX_INTERESTS}
                  style={{ padding: '14px 20px', borderRadius: '12px', backgroundColor: copper, color: '#fff', fontWeight: 700, fontSize: '14px', border: 'none', cursor: 'pointer', opacity: (!customInterest.trim() || selectedInterests.length >= MAX_INTERESTS) ? 0.4 : 1 }}
                >
                  Add
                </button>
              </div>

              <p style={labelStyle}>Suggestions</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
                {INTEREST_SUGGESTIONS.map((interest) => {
                  const sel = selectedInterests.includes(interest);
                  return (
                    <button
                      key={interest}
                      onClick={() => toggleInterest(interest)}
                      disabled={!sel && selectedInterests.length >= MAX_INTERESTS}
                      style={{
                        padding: '8px 14px', borderRadius: '999px', fontSize: '14px', fontWeight: 500,
                        border: sel ? 'none' : `1px solid ${mist}`, cursor: 'pointer',
                        backgroundColor: sel ? copper : '#fff', color: sel ? '#fff' : steel,
                        opacity: (!sel && selectedInterests.length >= MAX_INTERESTS) ? 0.4 : 1,
                        transition: 'all 0.2s',
                      }}
                    >
                      {sel ? '\u2713 ' : '+ '}{interest}
                    </button>
                  );
                })}
              </div>

              <div style={{ borderRadius: '12px', padding: '16px', backgroundColor: cream, border: `1px solid ${mist}` }}>
                <p style={{ ...labelStyle, marginBottom: '12px' }}>
                  Selected ({selectedInterests.length}/{MAX_INTERESTS})
                  {selectedInterests.length < 3 && <span style={{ color: copper, marginLeft: '8px', textTransform: 'none' }}>{3 - selectedInterests.length} more needed</span>}
                </p>
                {selectedInterests.length === 0 ? (
                  <p style={{ fontSize: '14px', color: steel, opacity: 0.5 }}>Pick at least 3 interests to continue</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {selectedInterests.map((interest: string) => (
                      <span key={interest} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#fff', padding: '6px 12px', borderRadius: '999px', fontSize: '14px', fontWeight: 500, color: steel, border: `1px solid ${mist}` }}>
                        {interest}
                        <button onClick={() => removeInterest(interest)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: steel, fontSize: '12px', lineHeight: 1, padding: 0 }}>&times;</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* STEP 3: Profile */}
          {step === 3 && (
            <>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', fontWeight: 700, color: dark, marginBottom: '24px' }}>
                Tell us about yourself
              </h1>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
                <div>
                  <label style={labelStyle}>Full Name</label>
                  <input type="text" placeholder="Your professional name" style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Profession</label>
                  <input type="text" placeholder="e.g. Software Engineer, UX Designer" style={inputStyle} value={profession} onChange={(e) => setProfession(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Company</label>
                  <input type="text" placeholder="Optional" style={inputStyle} value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
              </div>

              {/* Intent */}
              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Professional Intent</label>
                <textarea
                  placeholder="e.g. Seeking co-founders, hiring AI engineers..."
                  style={{ ...inputStyle, height: '100px', resize: 'none' as const }}
                  value={intent} onChange={(e) => setIntent(e.target.value)}
                />
              </div>

              {error && <div style={{ backgroundColor: '#fef2f2', borderLeft: `4px solid #ef4444`, padding: '16px', borderRadius: '0 8px 8px 0', marginTop: '16px' }}><p style={{ color: '#b91c1c', fontSize: '14px' }}>{error}</p></div>}
            </>
          )}

          {/* STEP 4: Signup */}
          {step === 4 && !user && (
            <>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', fontWeight: 700, color: dark, marginBottom: '8px' }}>
                Create your account
              </h1>
              <p style={{ fontSize: '14px', color: steel, marginBottom: '24px' }}>
                We'll send a verification link to your email.
              </p>

              {signupMessage ? (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ width: 48, height: 48, backgroundColor: '#dcfce7', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <svg style={{ width: 24, height: 24, color: '#16a34a' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </div>
                  <p style={{ color: '#166534', fontWeight: 600 }}>{signupMessage}</p>
                  <p style={{ color: '#16a34a', fontSize: '14px', marginTop: 8 }}>Click the link in your email to access the radar.</p>
                </div>
              ) : (
                <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input type="email" placeholder="you@company.com" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Password</label>
                    <input type="password" placeholder="Min 6 characters" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
                  </div>
                  {error && <div style={{ backgroundColor: '#fef2f2', borderLeft: `4px solid #ef4444`, padding: '16px', borderRadius: '0 8px 8px 0' }}><p style={{ color: '#b91c1c', fontSize: '14px' }}>{error}</p></div>}
                  <button type="submit" disabled={saving} style={{ width: '100%', padding: '16px', borderRadius: '12px', backgroundColor: copper, color: '#fff', fontWeight: 700, fontSize: '16px', border: 'none', cursor: 'pointer', opacity: saving ? 0.4 : 1, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                    {saving ? 'Creating account...' : 'Create Account'}
                  </button>

                  <div style={{ textAlign: 'center', marginTop: '12px' }}>
                    <p style={{ fontSize: '14px', color: steel, marginBottom: '8px' }}>Want to see the app first?</p>
                    <button type="button" onClick={handleSkipToDemo} style={{ width: '100%', padding: '14px', borderRadius: '12px', backgroundColor: '#fff', color: copper, fontWeight: 700, fontSize: '16px', border: `1px solid ${copper}`, cursor: 'pointer' }}>
                      Skip Login
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom continue button — ALWAYS visible, part of flex layout */}
      {step < 4 && (
        <div style={{ flexShrink: 0, padding: '16px', backgroundColor: cream, borderTop: `1px solid ${mist}` }}>
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <button
              onClick={handleNext}
              disabled={!canProceed() || saving}
              style={{
                width: '100%', padding: '16px', borderRadius: '12px',
                backgroundColor: copper, color: '#fff',
                fontWeight: 700, fontSize: '16px', border: 'none', cursor: 'pointer',
                opacity: (!canProceed() || saving) ? 0.4 : 1,
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                transition: 'opacity 0.2s',
              }}
            >
              {saving ? 'Saving...' : step === 3 && user ? 'Continue to Radar' : 'Continue'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
