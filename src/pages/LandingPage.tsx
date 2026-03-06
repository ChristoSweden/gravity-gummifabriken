import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config/appConfig';

export default function LandingPage() {
  const { enterDemoMode } = useAuth();
  const navigate = useNavigate();

  const handleSkipToDemo = () => {
    enterDemoMode();
    navigate('/radar');
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] flex flex-col items-center justify-center px-6 py-12">
      {/* Hero Visual */}
      <div className="mb-14 relative">
        {/* Outer ring */}
        <div className="w-52 h-52 rounded-full border border-[var(--color-sand)] flex items-center justify-center relative">
          {/* Pulse ring */}
          <div className="absolute inset-0 rounded-full border border-[var(--color-primary)]/20 animate-radar-pulse" />
          {/* Inner ball */}
          <div className="w-24 h-24 rounded-full bg-[var(--color-primary)] shadow-[0_8px_32px_rgba(184,115,51,0.35)] flex items-center justify-center">
            <span className="text-white font-serif text-[9px] tracking-[0.35em] font-bold uppercase select-none">
              {APP_CONFIG.APP_NAME}
            </span>
          </div>
        </div>
      </div>

      {/* Branding */}
      <h1 className="font-serif text-5xl sm:text-6xl text-[var(--color-text-header)] tracking-tight mb-3">
        {APP_CONFIG.APP_NAME}.
      </h1>
      <p className="font-serif italic text-lg text-[var(--color-primary)] mb-14 opacity-90">
        Proximity creates opportunity.
      </p>

      {/* CTAs */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        <button
          onClick={() => navigate('/onboarding')}
          className="btn-primary w-full py-4 text-sm"
        >
          Create Your Account
        </button>

        <button
          onClick={() => navigate('/login')}
          className="btn-secondary w-full py-4 text-xs"
        >
          Log In
        </button>

        <button
          onClick={handleSkipToDemo}
          className="mt-6 text-[11px] font-semibold text-[var(--color-steel-light)] uppercase tracking-widest hover:text-[var(--color-primary)] transition-colors py-2"
        >
          Skip to Demo
        </button>
      </div>
    </div>
  );
}
