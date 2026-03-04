import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseService';
import { useAuth } from '../contexts/AuthContext';

const copper = '#B87333';
const accent = '#C88B4A';
const steel = '#4A4A4A';
const mist = '#EDE8E0';
const cream = '#F9F5F0';
const dark = '#1A1A1A';

const inputStyle: React.CSSProperties = {
  border: `1px solid ${mist}`, color: steel, backgroundColor: '#fff',
  width: '100%', padding: '14px', borderRadius: '12px', outline: 'none', fontSize: '15px',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: steel,
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px',
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, loading, enterDemoMode } = useAuth();

  useEffect(() => {
    if (user && !loading) navigate('/');
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    else navigate('/');
  };

  const handleDemoLogin = () => {
    enterDemoMode();
    navigate('/onboarding');
  };

  if (loading || user) return null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: cream }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px', maxWidth: '480px', margin: '0 auto', width: '100%' }}>
        <button onClick={() => navigate('/')} style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', color: steel }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', fontWeight: 700, color: copper }}>Gravity.</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px 32px' }}>
        <div style={{ width: '100%', maxWidth: '480px' }}>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', fontWeight: 700, color: dark, marginBottom: '8px' }}>
            Welcome back
          </h1>
          <p style={{ fontSize: '14px', color: steel, marginBottom: '32px' }}>
            Sign in to see who's nearby.
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" placeholder="you@company.com" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Password</label>
              <input type="password" placeholder="Your password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            {error && (
              <div style={{ backgroundColor: '#fef2f2', borderLeft: '4px solid #ef4444', padding: '16px', borderRadius: '0 8px 8px 0' }}>
                <p style={{ color: '#b91c1c', fontSize: '14px' }}>{error}</p>
              </div>
            )}

            <button type="submit" style={{ width: '100%', padding: '16px', borderRadius: '12px', backgroundColor: copper, color: '#fff', fontWeight: 700, fontSize: '16px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
              Sign In
            </button>
          </form>

          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <button onClick={handleDemoLogin} style={{ width: '100%', padding: '16px', borderRadius: '12px', backgroundColor: accent, color: '#fff', fontWeight: 700, fontSize: '16px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              Try Demo Mode
            </button>

            <p style={{ fontSize: '14px', color: steel }}>
              Don't have an account?{' '}
              <button onClick={() => navigate('/onboarding')} style={{ fontWeight: 700, color: copper, border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Create one
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
