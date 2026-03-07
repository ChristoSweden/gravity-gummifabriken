import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config/appConfig';
import logoUrl from '../assets/logo.png';

const FEATURES = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
    title: 'Proximity Radar',
    description: 'See who\'s nearby in real time. No scrolling feeds — just the people around you, right now.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'Meaningful Matches',
    description: 'Matched by shared interests and intent — collaboration, mentorship, or a coffee chat.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: 'Privacy First',
    description: 'Go incognito anytime. Blur your profile. Full GDPR compliance with one-tap data erasure.',
  },
];

export default function LandingPage() {
  const { enterDemoMode } = useAuth();
  const navigate = useNavigate();

  const handleSkipToDemo = () => {
    enterDemoMode();
    navigate('/radar');
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] overflow-hidden">
      {/* ── Hero Section ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6">
        {/* Ambient background rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="w-[600px] h-[600px] rounded-full border border-[var(--color-primary)]/[0.06]" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="w-[440px] h-[440px] rounded-full border border-[var(--color-primary)]/[0.08]" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div
            className="w-[320px] h-[320px] rounded-full border border-[var(--color-primary)]/[0.12] animate-radar-pulse"
          />
        </div>

        {/* Logo — circular frame with copper ring, matching brand deck */}
        <div
          className="relative mb-12 animate-fade-in"
          style={{ animationDelay: '0.1s' }}
        >
          {/* Ambient glow behind frame */}
          <div className="absolute -inset-10 rounded-full bg-[var(--color-primary)]/[0.08] blur-3xl" />
          {/* Copper ring frame */}
          <div className="relative w-40 h-40 sm:w-52 sm:h-52 rounded-full p-[3px] bg-gradient-to-b from-[var(--color-primary-light)] via-[var(--color-primary)] to-[var(--color-primary-dark)] shadow-[0_20px_60px_rgba(184,115,51,0.3)]">
            <div className="w-full h-full rounded-full overflow-hidden bg-[#1a1612]">
              <img
                src={logoUrl}
                alt="Gravity"
                className="w-full h-full object-cover scale-125"
              />
            </div>
          </div>
        </div>

        {/* Headline */}
        <div className="text-center animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <h1 className="font-serif text-5xl sm:text-7xl text-[var(--color-text-header)] tracking-tight leading-[1.1]">
            {APP_CONFIG.APP_NAME}.
          </h1>
          <p className="mt-4 font-serif italic text-lg sm:text-xl text-[var(--color-primary)] opacity-90">
            Proximity creates opportunity.
          </p>
        </div>

        {/* Subheadline */}
        <p
          className="mt-8 max-w-md text-center text-[var(--color-text-secondary)] text-[15px] leading-relaxed animate-fade-in"
          style={{ animationDelay: '0.5s' }}
        >
          The professional networking layer for {APP_CONFIG.LOCATION_NAME}.
          <br className="hidden sm:block" />
          Discover who's around you and why you should meet.
        </p>

        {/* CTAs */}
        <div
          className="mt-12 w-full max-w-xs flex flex-col gap-3 animate-fade-in"
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
            className="btn-secondary w-full py-3.5 text-xs"
          >
            Log In
          </button>
        </div>

        {/* Scroll hint */}
        <div
          className="absolute bottom-10 flex flex-col items-center gap-2 animate-fade-in"
          style={{ animationDelay: '1.2s' }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-steel-light)]">
            Learn more
          </span>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="var(--color-steel-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="animate-gentle-pulse"
          >
            <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
          </svg>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-24 sm:py-32 px-6">
        <div className="max-w-2xl mx-auto">
          <p className="section-label text-center mb-3">How It Works</p>
          <h2 className="font-serif text-3xl sm:text-4xl text-center text-[var(--color-text-header)] mb-16">
            Networking, <span className="italic text-[var(--color-primary)]">redesigned.</span>
          </h2>

          <div className="space-y-6">
            {FEATURES.map((feature, i) => (
              <div
                key={i}
                className="card p-6 sm:p-8 flex gap-5 items-start"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[var(--color-mist)] flex items-center justify-center text-[var(--color-primary)]">
                  {feature.icon}
                </div>
                <div>
                  <h3 className="font-serif text-lg text-[var(--color-text-header)] mb-1">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social proof / Venue ── */}
      <section className="py-24 sm:py-32 px-6 bg-gradient-to-b from-[var(--color-mist)] to-[var(--color-bg-warm)]">
        <div className="max-w-lg mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-sand)] text-[var(--color-text-secondary)] text-xs font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-gentle-pulse" />
            Live at {APP_CONFIG.LOCATION_NAME}
          </div>

          <h2 className="font-serif text-3xl sm:text-4xl text-[var(--color-text-header)] mb-6">
            Built for spaces
            <br />
            where <span className="italic text-[var(--color-primary)]">people gather.</span>
          </h2>
          <p className="text-[var(--color-text-secondary)] text-[15px] leading-relaxed mb-12 max-w-sm mx-auto">
            Gravity turns shared physical spaces into networks of possibility.
            Check in, discover aligned professionals, and let proximity do the rest.
          </p>

          <div className="flex justify-center gap-12 mb-14">
            <div className="text-center">
              <div className="font-serif text-3xl text-[var(--color-primary)]">30s</div>
              <div className="text-[11px] text-[var(--color-steel-light)] uppercase tracking-widest mt-1">Setup</div>
            </div>
            <div className="w-px bg-[var(--color-sand)]" />
            <div className="text-center">
              <div className="font-serif text-3xl text-[var(--color-primary)]">50m</div>
              <div className="text-[11px] text-[var(--color-steel-light)] uppercase tracking-widest mt-1">Range</div>
            </div>
            <div className="w-px bg-[var(--color-sand)]" />
            <div className="text-center">
              <div className="font-serif text-3xl text-[var(--color-primary)]">100%</div>
              <div className="text-[11px] text-[var(--color-steel-light)] uppercase tracking-widest mt-1">Private</div>
            </div>
          </div>

          <button
            onClick={() => navigate('/onboarding')}
            className="btn-primary px-10 py-4 text-sm"
          >
            Join {APP_CONFIG.LOCATION_NAME}
          </button>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-20 px-6">
        <div className="max-w-md mx-auto text-center">
          <h2 className="font-serif text-2xl sm:text-3xl text-[var(--color-text-header)] mb-4">
            The best connections happen
            <br />
            <span className="italic text-[var(--color-primary)]">in person.</span>
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-10">
            No swiping. No algorithms. Just real people, really nearby.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/onboarding')}
              className="btn-primary px-8 py-3.5 text-xs"
            >
              Create Your Account
            </button>
            <button
              onClick={handleSkipToDemo}
              className="btn-secondary px-8 py-3.5 text-xs"
            >
              Try the Demo
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-6 border-t border-[var(--color-sand)]/60">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={logoUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
            <span className="font-serif text-sm text-[var(--color-text-header)]">{APP_CONFIG.APP_NAME}.</span>
          </div>
          <p className="text-[11px] text-[var(--color-steel-light)]">
            Proximity creates opportunity. Made for {APP_CONFIG.LOCATION_NAME}.
          </p>
        </div>
      </footer>
    </div>
  );
}
