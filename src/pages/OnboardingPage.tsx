import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { setDemoInterests, setDemoProfile } from '../services/mockData';

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
    setError(null);
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
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: data.user.id, full_name: fullName, profession: profession, company,
        interests: selectedInterests, intent,
        gps_enabled: gpsEnabled, notifications_enabled: notificationsEnabled,
        updated_at: new Date().toISOString(),
      });
      if (profileErr) { setError(profileErr.message); setSaving(false); return; }
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
        <div style={{ maxWidth: '480px', margin: '0 auto', width: '100%', textAlign: 'center' }}>

          {/* STEP 1: Proximity */}
          {step === 1 && (
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '32px', fontWeight: 700, color: dark, marginBottom: '8px', textAlign: 'center' }}>
                Proximity Settings
              </h1>
              <p style={{ fontSize: '15px', color: steel, opacity: 0.7, marginBottom: '32px', textAlign: 'center' }}>
                Detect when you're near Gummifabriken
              </p>

              {/* Proximity toggles */}
              {[
                { label: 'GPS Location', desc: "Detect when you're near the building", value: gpsEnabled, toggle: () => setGpsEnabled(!gpsEnabled) },
                { label: 'Notifications', desc: 'Alerts for incoming handshake requests', value: notificationsEnabled, toggle: () => setNotificationsEnabled(!notificationsEnabled) },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', backgroundColor: '#fff', borderRadius: '16px', border: `1px solid ${mist}`, marginBottom: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ textAlign: 'left' }}>
                    <p style={{ fontWeight: 700, fontSize: '16px', color: dark }}>{item.label}</p>
                    <p style={{ fontSize: '13px', color: steel, opacity: 0.6, marginTop: 4 }}>{item.desc}</p>
                  </div>
                  <button onClick={item.toggle} style={{ position: 'relative', width: 52, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer', backgroundColor: item.value ? copper : '#d1d5db', transition: 'background-color 0.2s', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 3, left: 3, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'transform 0.2s', transform: item.value ? 'translateX(22px)' : 'translateX(0)' }} />
                  </button>
                </div>
              ))}

              <div style={{ marginTop: '32px', padding: '20px', borderRadius: '16px', backgroundColor: '#fff', border: `1px solid ${mist}`, display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ padding: '8px', backgroundColor: cream, borderRadius: '8px', color: copper }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                </div>
                <p style={{ fontSize: '14px', color: steel, lineHeight: 1.5 }}>
                  <strong>Privacy First</strong>: Your exact location is never shared with anyone. We only detect if you're in the building range to enable networking.
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: Interests */}
          {step === 2 && (
            <>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '32px', fontWeight: 700, color: dark, marginBottom: '8px', textTransform: 'uppercase' }}>
                WHAT DRIVES YOU?
              </h1>
              <p style={{ fontSize: '16px', color: steel, opacity: 0.7, marginBottom: '32px' }}>
                Pick at least 3 professional interests. This is how we find your people.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginBottom: '32px' }}>
                {INTEREST_SUGGESTIONS.map((interest) => {
                  const sel = selectedInterests.includes(interest);
                  return (
                    <button
                      key={interest}
                      onClick={() => toggleInterest(interest)}
                      disabled={!sel && selectedInterests.length >= MAX_INTERESTS}
                      style={{
                        padding: '12px 24px', borderRadius: '24px', fontSize: '15px', fontWeight: 700,
                        border: '2px solid #000', cursor: 'pointer',
                        backgroundColor: sel ? '#000' : '#fff', color: sel ? '#fff' : '#000',
                        transition: 'all 0.2s',
                        transform: sel ? 'scale(1.05)' : 'scale(1)',
                      }}
                    >
                      {interest}
                    </button>
                  );
                })}
              </div>

              <div style={{ marginBottom: '24px' }}>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#16a34a' }}>
                  {selectedInterests.length} selected
                </p>
              </div>

              {error && (
                <div style={{ backgroundColor: '#fef2f2', borderLeft: `4px solid #ef4444`, padding: '16px', borderRadius: '8px', textAlign: 'left', marginBottom: '24px' }}>
                  <p style={{ color: '#b91c1c', fontSize: '14px', fontWeight: 500 }}>{error}</p>
                </div>
              )}
            </>
          )}

          {/* STEP 3: Profile */}
          {step === 3 && (
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '32px', fontWeight: 700, color: dark, marginBottom: '8px' }}>
                Professional Profile
              </h1>
              <p style={{ fontSize: '15px', color: steel, opacity: 0.7, marginBottom: '32px' }}>
                Let others know who you are and what you're looking for.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '32px' }}>
                <div>
                  <label style={labelStyle}>Full Name</label>
                  <input type="text" placeholder="Your name" style={{ ...inputStyle, padding: '18px' }} value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Profession</label>
                  <input type="text" placeholder="e.g. Founder, Designer" style={{ ...inputStyle, padding: '18px' }} value={profession} onChange={(e) => setProfession(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Company / Organization</label>
                  <input type="text" placeholder="Where you work" style={{ ...inputStyle, padding: '18px' }} value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Professional Intent (Bio)</label>
                  <textarea
                    placeholder="What are you working on? What do you need help with?"
                    style={{ ...inputStyle, height: '120px', resize: 'none', padding: '18px' }}
                    value={intent} onChange={(e) => setIntent(e.target.value)}
                  />
                </div>
              </div>

              {error && (
                <div style={{ backgroundColor: '#fef2f2', borderLeft: `4px solid #ef4444`, padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
                  <p style={{ color: '#b91c1c', fontSize: '14px' }}>{error}</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Signup */}
          {step === 4 && !user && (
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '32px', fontWeight: 700, color: dark, marginBottom: '8px' }}>
                Join Gravity
              </h1>
              <p style={{ fontSize: '15px', color: steel, opacity: 0.7, marginBottom: '32px' }}>
                Secure your profile and start connecting.
              </p>

              {signupMessage ? (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '32px', borderRadius: '24px', textAlign: 'center', boxShadow: '0 4px 12px rgba(22,163,74,0.08)' }}>
                  <div style={{ width: 64, height: 64, backgroundColor: '#dcfce7', borderRadius: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </div>
                  <p style={{ color: '#166534', fontWeight: 700, fontSize: '18px', marginBottom: '8px' }}>Check your email</p>
                  <p style={{ color: '#16a34a', fontSize: '15px' }}>{signupMessage}</p>
                </div>
              ) : (
                <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div>
                    <label style={labelStyle}>Email Address</label>
                    <input type="email" style={{ ...inputStyle, padding: '18px' }} value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Password</label>
                    <input type="password" style={{ ...inputStyle, padding: '18px' }} value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
                  </div>
                  {error && <div style={{ backgroundColor: '#fef2f2', borderLeft: `4px solid #ef4444`, padding: '16px', borderRadius: '8px' }}><p style={{ color: '#b91c1c', fontSize: '14px' }}>{error}</p></div>}

                  <button type="submit" disabled={saving} style={{ width: '100%', padding: '20px', borderRadius: '16px', backgroundColor: copper, color: '#fff', fontWeight: 700, fontSize: '18px', border: 'none', cursor: 'pointer', opacity: saving ? 0.4 : 1, boxShadow: '0 8px 16px rgba(184,115,51,0.2)' }}>
                    {saving ? 'Creating Account...' : 'Finish Signup'}
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '8px 0' }}>
                    <div style={{ flex: 1, height: '1px', backgroundColor: mist }} />
                    <span style={{ fontSize: '13px', color: steel, opacity: 0.5, fontWeight: 700 }}>OR</span>
                    <div style={{ flex: 1, height: '1px', backgroundColor: mist }} />
                  </div>

                  <button type="button" onClick={handleSkipToDemo} style={{ width: '100%', padding: '18px', borderRadius: '16px', backgroundColor: '#fff', color: steel, fontWeight: 700, fontSize: '16px', border: `2px solid ${mist}`, cursor: 'pointer' }}>
                    Continue as Guest
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom continue button */}
      {step < 4 && (
        <div style={{ flexShrink: 0, padding: '24px', backgroundColor: cream, borderTop: `1px solid ${mist}` }}>
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <button
              onClick={handleNext}
              disabled={!canProceed() || saving}
              style={{
                width: '100%', padding: '20px', borderRadius: '16px',
                backgroundColor: copper, color: '#fff',
                fontWeight: 800, fontSize: '18px', border: 'none', cursor: 'pointer',
                opacity: (!canProceed() || saving) ? 0.4 : 1,
                boxShadow: '0 8px 24px rgba(184,115,51,0.25)',
                transition: 'all 0.2s transform active:scale(0.98)',
                display: 'block',
                visibility: 'visible',
              }}
            >
              {saving ? 'Saving...' : step === 3 && user ? 'Enter the Radar' : 'Proceed'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
