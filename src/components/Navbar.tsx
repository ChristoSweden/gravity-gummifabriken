import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config/appConfig';

export default function Navbar() {
  const { user } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navLink = (to: string, label: string) => (
    <Link
      to={to}
      className={`text-[11px] font-semibold uppercase tracking-widest transition-colors py-1 border-b-2 ${
        isActive(to)
          ? 'text-[--color-primary] border-[--color-primary]'
          : 'text-[--color-steel-light] border-transparent hover:text-[--color-text-primary]'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="glass-effect px-6 py-4 border-b border-[--color-sand]/60 sticky top-0 z-50">
      <div className="max-w-2xl mx-auto flex justify-between items-center">
        <Link
          to={user ? '/radar' : '/'}
          className="font-serif text-xl text-[--color-text-header] hover:text-[--color-primary] transition-colors"
        >
          {APP_CONFIG.APP_NAME}.
        </Link>

        <div className="flex items-center gap-6">
          {user ? (
            <>
              {navLink('/radar', 'Radar')}
              {navLink('/connections', 'Network')}
              <Link
                to="/profile"
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  isActive('/profile')
                    ? 'bg-[--color-primary] text-white'
                    : 'border border-[--color-sand] text-[--color-steel-light] hover:border-[--color-primary] hover:text-[--color-primary]'
                }`}
                aria-label="Profile"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="text-[11px] font-semibold text-[--color-steel-light] uppercase tracking-widest hover:text-[--color-text-primary] transition-colors">
                Log In
              </Link>
              <Link
                to="/onboarding"
                className="btn-primary px-5 py-2.5 text-[10px]"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
