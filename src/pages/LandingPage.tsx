import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config/appConfig';
import logoUrl from '../assets/logo.png';

export default function LandingPage() {
  const { enterDemoMode } = useAuth();
  const navigate = useNavigate();

  const handleSkipToDemo = () => {
    enterDemoMode();
    navigate('/radar');
  };

  return (
    <div className="min-h-screen bg-[#0D0B09] overflow-hidden flex flex-col relative">
      {/* Warm ambient glow behind the logo area */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 30%, rgba(184,115,51,0.18) 0%, rgba(139,90,43,0.08) 30%, rgba(13,11,9,0) 65%)',
        }}
      />

      {/* Decorative sparkle — bottom right */}
      <div className="absolute bottom-8 right-8 pointer-events-none" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 2l1.5 8.5L22 12l-8.5 1.5L12 22l-1.5-8.5L2 12l8.5-1.5L12 2z" fill="#D4AF37" opacity="0.6" />
        </svg>
      </div>

      {/* Content — single viewport, vertically centred */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-6 py-16">
        {/* Logo — large, glowing, floating on dark */}
        <div className="relative mb-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {/* Copper bloom behind logo */}
          <div
            className="absolute -inset-12 rounded-full blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(184,115,51,0.35) 0%, rgba(139,90,43,0.15) 40%, transparent 70%)',
            }}
          />
          <div className="relative w-36 h-36 sm:w-48 sm:h-48">
            <img
              src={logoUrl}
              alt="Gravity"
              className="w-full h-full object-contain drop-shadow-[0_8px_40px_rgba(184,115,51,0.5)]"
            />
          </div>
        </div>

        {/* Tagline */}
        <div className="text-center animate-fade-in" style={{ animationDelay: '0.35s' }}>
          <p className="font-serif italic text-lg sm:text-xl text-[#D4956A]">
            Proximity creates opportunity.
          </p>
        </div>

        {/* Description */}
        <p
          className="mt-4 max-w-[280px] text-center text-[#A09890] text-[15px] leading-relaxed animate-fade-in"
          style={{ animationDelay: '0.5s' }}
        >
          The professional networking layer for {APP_CONFIG.LOCATION_NAME}.
          Discover who's around you and why you should meet.
        </p>

        {/* CTAs */}
        <div
          className="mt-10 w-full max-w-xs flex flex-col gap-3 animate-fade-in"
          style={{ animationDelay: '0.7s' }}
        >
          {/* Primary: Get Started — copper fill */}
          <button
            onClick={() => navigate('/onboarding')}
            className="w-full py-4 text-sm font-serif font-bold uppercase tracking-[0.08em] rounded-full text-white transition-all"
            style={{
              background: 'linear-gradient(135deg, #D4956A 0%, #B87333 50%, #8B5A2B 100%)',
              boxShadow: '0 8px 32px rgba(184,115,51,0.35), 0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            Get Started
          </button>

          {/* Secondary: Log In — gold outline */}
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3.5 text-xs font-semibold uppercase tracking-[0.05em] rounded-full text-[#D4AF37] border border-[#D4AF37]/40 hover:bg-[#D4AF37]/8 transition-all"
          >
            Log In
          </button>

          {/* Ghost: Try Demo */}
          <button
            onClick={handleSkipToDemo}
            className="w-full py-2.5 text-[12px] font-semibold text-[#7A7572] hover:text-[#D4956A] transition-colors uppercase tracking-widest"
          >
            Try Demo
          </button>
        </div>
      </section>
    </div>
  );
}
