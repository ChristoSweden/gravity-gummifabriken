import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LandingPage() {
  const { enterDemoMode } = useAuth();
  const navigate = useNavigate();

  const handleSkipToDemo = () => {
    enterDemoMode();
    navigate('/radar');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F9F5F0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      {/* Gravity Ball */}
      <div style={{ marginBottom: '40px' }}>
        <div className="w-56 h-56 rounded-full border-4 border-white shadow-[0_0_60px_rgba(184,115,51,0.15)] flex items-center justify-center bg-gradient-to-br from-[#3a2a1a] via-[#5a3a20] to-[#2a1a0a] overflow-hidden">
          <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-[#d4956a] via-[#B87333] to-[#8a5520] shadow-[inset_-8px_-8px_20px_rgba(0,0,0,0.4),inset_8px_8px_20px_rgba(255,200,150,0.3),0_8px_30px_rgba(0,0,0,0.3)]">
            <span className="absolute inset-0 flex items-center justify-center text-[#f0d8c0] font-serif text-sm tracking-[0.3em] font-bold opacity-80 select-none">
              GRAVITY
            </span>
            <div className="absolute top-3 left-6 w-8 h-4 rounded-full bg-gradient-to-br from-white/30 to-transparent blur-[2px] rotate-[-30deg]" />
          </div>
        </div>
      </div>

      {/* Title */}
      <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '48px', fontWeight: 700, color: '#1A1A1A', marginBottom: '16px', letterSpacing: '-0.02em' }}>
        Gravity.
      </h1>

      {/* Tagline */}
      <p style={{ fontSize: '20px', color: '#C88B4A', fontWeight: 300, marginBottom: '48px', textAlign: 'center', lineHeight: 1.6 }}>
        Proximity creates<br />Opportunity.
      </p>

      {/* CTA Buttons */}
      <div style={{ width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <button
          onClick={() => navigate('/onboarding')}
          style={{
            width: '100%', padding: '16px', borderRadius: '16px',
            backgroundColor: '#C88B4A', color: '#FFFFFF',
            fontWeight: 700, fontSize: '18px', border: 'none', cursor: 'pointer',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
            transition: 'opacity 0.2s',
          }}
        >
          Create Your Account
        </button>

        <button
          onClick={() => navigate('/login')}
          style={{
            width: '100%', padding: '16px', borderRadius: '16px',
            backgroundColor: '#FFFFFF', color: '#C88B4A',
            fontWeight: 700, fontSize: '18px',
            border: '2px solid #C88B4A', cursor: 'pointer',
            transition: 'opacity 0.2s',
          }}
        >
          Log In
        </button>

        <button
          onClick={handleSkipToDemo}
          style={{
            width: '100%', padding: '8px',
            backgroundColor: 'transparent', color: '#4A4A4A',
            fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer',
          }}
        >
          Skip to Demo
        </button>
      </div>
    </div>
  );
}
