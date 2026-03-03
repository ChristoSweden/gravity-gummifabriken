import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LandingPage() {
  const { enterDemoMode } = useAuth();
  const navigate = useNavigate();

  const handleDemo = () => {
    enterDemoMode();
    navigate('/onboarding');
  };

  return (
    <div className="min-h-screen bg-[--color-bg-warm] flex flex-col items-center justify-center p-6">
      {/* Gravity Ball */}
      <div className="relative mb-10">
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
      <h1 className="text-5xl md:text-6xl font-brand text-[--color-text-header] mb-4 tracking-tight">
        Gravity.
      </h1>

      {/* Tagline */}
      <p className="text-xl md:text-2xl text-[--color-accent] font-light mb-12 text-center leading-relaxed">
        Proximity creates<br />Opportunity.
      </p>

      {/* CTA Buttons */}
      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={handleDemo}
          className="w-full bg-[--color-accent] text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl hover:bg-opacity-90 transition-all"
        >
          Create Your Account
        </button>

        <Link
          to="/login"
          className="block w-full text-center bg-white text-[--color-accent] py-4 rounded-2xl font-bold text-lg border-2 border-[--color-accent] hover:bg-[--color-bg-warm] transition-all"
        >
          Log In
        </Link>
      </div>
    </div>
  );
}
