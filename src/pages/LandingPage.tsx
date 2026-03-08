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
          background: 'radial-gradient(ellipse 80% 50% at 50% 25%, rgba(184,115,51,0.18) 0%, rgba(139,90,43,0.08) 30%, rgba(13,11,9,0) 65%)',
        }}
      />

      {/* Content — single viewport, vertically centred */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Animated mini-radar behind logo */}
        <div className="relative mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {/* Copper bloom behind logo */}
          <div
            className="absolute -inset-16 rounded-full blur-3xl"
            aria-hidden="true"
            style={{
              background: 'radial-gradient(circle, rgba(184,115,51,0.3) 0%, rgba(139,90,43,0.12) 40%, transparent 70%)',
            }}
          />

          {/* Mini radar rings */}
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div className="absolute w-48 h-48 sm:w-64 sm:h-64 rounded-full border border-[#B87333]/15 animate-radar-pulse" style={{ animationDelay: '0s' }} />
            <div className="absolute w-48 h-48 sm:w-64 sm:h-64 rounded-full border border-[#B87333]/10 animate-radar-pulse" style={{ animationDelay: '1.2s' }} />
            <div className="absolute w-48 h-48 sm:w-64 sm:h-64 rounded-full border border-[#B87333]/8 animate-radar-pulse" style={{ animationDelay: '2.4s' }} />
          </div>

          {/* Floating user dots around the radar */}
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            {[
              { x: -52, y: -38, delay: '0.5s', size: 6, opacity: 0.9 },
              { x: 48, y: -28, delay: '1.2s', size: 5, opacity: 0.7 },
              { x: -35, y: 45, delay: '0.8s', size: 7, opacity: 0.8 },
              { x: 55, y: 35, delay: '1.5s', size: 5, opacity: 0.6 },
              { x: 10, y: -55, delay: '2.0s', size: 6, opacity: 0.7 },
              { x: -58, y: 5, delay: '1.8s', size: 4, opacity: 0.5 },
            ].map((dot, i) => (
              <div
                key={i}
                className="absolute rounded-full animate-pip"
                style={{
                  width: dot.size,
                  height: dot.size,
                  background: `rgba(212, 175, 55, ${dot.opacity})`,
                  boxShadow: `0 0 ${dot.size * 2}px rgba(212, 175, 55, 0.4)`,
                  left: `calc(50% + ${dot.x}px)`,
                  top: `calc(50% + ${dot.y}px)`,
                  animationDelay: dot.delay,
                }}
              />
            ))}
          </div>

          {/* Logo */}
          <div className="relative w-28 h-28 sm:w-36 sm:h-36">
            <img
              src={logoUrl}
              alt="Gravity"
              className="w-full h-full object-contain drop-shadow-[0_8px_40px_rgba(184,115,51,0.5)]"
            />
          </div>
        </div>

        {/* App name */}
        <h1
          className="font-serif text-4xl sm:text-5xl text-white tracking-wide animate-fade-in"
          style={{ animationDelay: '0.3s' }}
        >
          {APP_CONFIG.APP_NAME}
        </h1>

        {/* Tagline */}
        <div className="mt-2.5 text-center animate-fade-in" style={{ animationDelay: '0.45s' }}>
          <p className="font-serif italic text-lg sm:text-xl text-[#D4956A]">
            Proximity creates opportunity.
          </p>
        </div>

        {/* Description */}
        <p
          className="mt-3 max-w-[280px] text-center text-[#A09890] text-[14px] leading-relaxed animate-fade-in"
          style={{ animationDelay: '0.5s' }}
        >
          The professional networking layer for {APP_CONFIG.LOCATION_NAME}.
          Discover who's around you and why you should meet.
        </p>

        {/* Feature highlights */}
        <div
          className="mt-8 w-full max-w-xs grid grid-cols-3 gap-3 animate-fade-in"
          style={{ animationDelay: '0.6s' }}
        >
          {[
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4956A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
                </svg>
              ),
              label: 'Radar',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4956A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              ),
              label: 'Connect',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4956A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              ),
              label: 'Chat',
            },
          ].map((feat) => (
            <div key={feat.label} className="flex flex-col items-center gap-1.5">
              <div className="w-10 h-10 rounded-full border border-[#B87333]/25 flex items-center justify-center bg-[#B87333]/5">
                {feat.icon}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#A09890]">{feat.label}</span>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div
          className="mt-8 w-full max-w-xs flex flex-col gap-3 animate-fade-in"
          style={{ animationDelay: '0.7s' }}
        >
          {/* Primary: Get Started — copper fill */}
          <button
            onClick={() => navigate('/onboarding')}
            className="w-full py-4 text-sm font-serif font-bold uppercase tracking-[0.08em] rounded-full text-white transition-all active:scale-[0.98]"
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
            className="w-full py-3.5 text-xs font-semibold uppercase tracking-[0.05em] rounded-full text-[#D4AF37] border border-[#D4AF37]/40 hover:bg-[#D4AF37]/8 transition-all active:scale-[0.98]"
          >
            Log In
          </button>

          {/* Ghost: Try Demo */}
          <button
            onClick={handleSkipToDemo}
            className="w-full py-2.5 text-[12px] font-semibold text-[#7A7572] hover:text-[#D4956A] transition-colors uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4956A] animate-gentle-pulse" />
            Try Demo
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative text-center pb-6 animate-fade-in" style={{ animationDelay: '0.9s' }}>
        <p className="text-[10px] text-[#5A5550] tracking-widest uppercase">
          {APP_CONFIG.LOCATION_NAME} · {APP_CONFIG.THEME.PRIMARY_LABEL}
        </p>
      </footer>
    </div>
  );
}
