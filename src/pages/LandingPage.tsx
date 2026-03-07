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
    <div className="min-h-screen bg-[var(--color-bg-warm)] overflow-hidden flex flex-col">
      {/* ── Hero — full viewport ── */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-40">
        {/* Warm radial gradient that bleeds the logo colours into the background */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background: 'radial-gradient(ellipse 70% 55% at 50% 38%, rgba(184,115,51,0.10) 0%, rgba(212,149,106,0.06) 35%, rgba(250,247,242,0) 70%)',
          }}
        />

        {/* Subtle concentric radar rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="w-[520px] h-[520px] rounded-full border border-[var(--color-primary)]/[0.05]" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="w-[360px] h-[360px] rounded-full border border-[var(--color-primary)]/[0.08]" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="w-[220px] h-[220px] rounded-full border border-[var(--color-primary)]/[0.10] animate-radar-pulse" />
        </div>

        {/* Logo — large, softly masked, blends into the gradient */}
        <div className="relative mb-10 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {/* Wide warm glow that connects logo to background */}
          <div className="absolute -inset-16 rounded-full bg-gradient-to-b from-[var(--color-primary)]/[0.12] via-[var(--color-primary-light)]/[0.06] to-transparent blur-3xl" />
          <div className="relative w-32 h-32 sm:w-44 sm:h-44">
            <img
              src={logoUrl}
              alt="Gravity"
              className="w-full h-full object-cover rounded-full"
              style={{
                maskImage: 'radial-gradient(circle, black 55%, transparent 78%)',
                WebkitMaskImage: 'radial-gradient(circle, black 55%, transparent 78%)',
              }}
            />
          </div>
        </div>

        {/* Headline */}
        <div className="text-center animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <h1 className="font-serif text-5xl sm:text-7xl text-[var(--color-text-header)] tracking-tight leading-[1.1]">
            {APP_CONFIG.APP_NAME}.
          </h1>
          <p className="mt-3 font-serif italic text-lg sm:text-xl text-[var(--color-primary)] opacity-90">
            Proximity creates opportunity.
          </p>
        </div>

        {/* Sub-headline */}
        <p
          className="mt-6 max-w-sm text-center text-[var(--color-text-secondary)] text-[15px] leading-relaxed animate-fade-in"
          style={{ animationDelay: '0.5s' }}
        >
          The professional networking layer for {APP_CONFIG.LOCATION_NAME}.
          Discover who's around you and why you should meet.
        </p>

        {/* 3 clean CTAs: Get Started / Log In / Try Demo */}
        <div
          className="mt-10 w-full max-w-xs flex flex-col gap-3 animate-fade-in"
          style={{ animationDelay: '0.7s' }}
        >
          <button
            onClick={() => navigate('/onboarding')}
            className="btn-primary w-full py-4 text-sm"
          >
            Get Started
          </button>

          <button
            onClick={() => navigate('/login')}
            className="btn-secondary w-full py-3 text-xs"
          >
            Log In
          </button>

          <button
            onClick={handleSkipToDemo}
            className="w-full py-2.5 text-[12px] font-semibold text-[var(--color-steel-light)] hover:text-[var(--color-primary)] transition-colors uppercase tracking-widest"
          >
            Try Demo
          </button>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 px-6">
        <div className="max-w-md mx-auto">
          <p className="section-label text-center mb-3">How It Works</p>
          <h2 className="font-serif text-3xl text-center text-[var(--color-text-header)] mb-12">
            Networking, <span className="italic text-[var(--color-primary)]">redesigned.</span>
          </h2>

          <div className="space-y-4">
            {[
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
                  </svg>
                ),
                title: 'Proximity Radar',
                desc: 'See who\'s nearby in real time. No feeds — just the people around you.',
              },
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
                title: 'Meaningful Matches',
                desc: 'Matched by shared interests — collaboration, mentorship, or coffee.',
              },
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ),
                title: 'Privacy First',
                desc: 'Go incognito anytime. Full GDPR compliance with one-tap data erasure.',
              },
            ].map((f, i) => (
              <div key={i} className="card p-5 flex gap-4 items-start">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--color-mist)] flex items-center justify-center text-[var(--color-primary)]">
                  {f.icon}
                </div>
                <div>
                  <h3 className="font-serif text-[16px] text-[var(--color-text-header)] mb-0.5">{f.title}</h3>
                  <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ribbon ── */}
      <section className="py-16 px-6 bg-gradient-to-b from-[var(--color-mist)] to-[var(--color-bg-warm)]">
        <div className="max-w-xs mx-auto flex justify-between text-center">
          <div>
            <div className="font-serif text-2xl text-[var(--color-primary)]">30s</div>
            <div className="text-[10px] text-[var(--color-steel-light)] uppercase tracking-widest mt-1">Setup</div>
          </div>
          <div className="w-px bg-[var(--color-sand)]" />
          <div>
            <div className="font-serif text-2xl text-[var(--color-primary)]">50m</div>
            <div className="text-[10px] text-[var(--color-steel-light)] uppercase tracking-widest mt-1">Range</div>
          </div>
          <div className="w-px bg-[var(--color-sand)]" />
          <div>
            <div className="font-serif text-2xl text-[var(--color-primary)]">100%</div>
            <div className="text-[10px] text-[var(--color-steel-light)] uppercase tracking-widest mt-1">Private</div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 px-6 border-t border-[var(--color-sand)]/60">
        <div className="max-w-md mx-auto text-center">
          <p className="text-[11px] text-[var(--color-steel-light)]">
            Proximity creates opportunity. Made for {APP_CONFIG.LOCATION_NAME}.
          </p>
        </div>
      </footer>
    </div>
  );
}
