import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config/appConfig';
import logoUrl from '../assets/logo.png';
import { supabase } from '../services/supabaseService';
import { getDemoConnections, MOCK_ME } from '../services/mockData';

export default function Navbar() {
  const { user, isDemo } = useAuth();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  const isActive = (path: string) => location.pathname === path;

  useEffect(() => {
    if (!user) { setPendingCount(0); return; }

    if (isDemo) {
      const count = getDemoConnections().filter(
        (c) => c.recipient_id === MOCK_ME.id && c.status === 'pending'
      ).length;
      setPendingCount(count);
      return;
    }

    const fetchCount = async () => {
      const { count } = await supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('status', 'pending');
      setPendingCount(count || 0);
    };

    fetchCount();

    const channel = supabase
      .channel('navbar-pending')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `recipient_id=eq.${user.id}` }, fetchCount)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isDemo]);

  const navLink = (to: string, label: string, badge?: number) => (
    <Link
      to={to}
      className={`relative text-[11px] font-semibold uppercase tracking-widest transition-colors py-1 border-b-2 ${
        isActive(to)
          ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
          : 'text-[var(--color-steel-light)] border-transparent hover:text-[var(--color-text-primary)]'
      }`}
    >
      {label}
      {badge ? (
        <span className="absolute -top-1.5 -right-3 w-4 h-4 bg-[var(--color-error)] text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-gentle-pulse">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </Link>
  );

  return (
    <nav className="glass-effect px-6 py-4 border-b border-[var(--color-sand)]/60 sticky top-0 z-50">
      <div className="max-w-2xl mx-auto flex justify-between items-center">
        <Link
          to={user ? '/radar' : '/'}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <img src={logoUrl} alt="Gravity" className="w-8 h-8 rounded-full object-cover" />
          <span className="font-serif text-xl text-[var(--color-text-header)]">{APP_CONFIG.APP_NAME}.</span>
        </Link>

        <div className="flex items-center gap-6">
          {user ? (
            <>
              {navLink('/radar', 'Radar')}
              {navLink('/connections', 'Network', pendingCount || undefined)}
              <Link
                to="/profile"
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  isActive('/profile')
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'border border-[var(--color-sand)] text-[var(--color-steel-light)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                }`}
                aria-label="Profile"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="text-[11px] font-semibold text-[var(--color-steel-light)] uppercase tracking-widest hover:text-[var(--color-text-primary)] transition-colors">
                Log In
              </Link>
              <Link to="/onboarding" className="btn-primary px-5 py-2.5 text-[10px]">
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
