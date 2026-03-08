import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { APP_CONFIG } from '../config/appConfig';
import logoUrl from '../assets/logo.png';
import { supabase } from '../services/supabaseService';
import { getDemoConnections, MOCK_ME } from '../services/mockData';
import { haptic } from '../utils/haptics';

export default function Navbar() {
  const { user, isDemo } = useAuth();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isAdmin = user && APP_CONFIG.ADMIN_EMAILS.length > 0
    && APP_CONFIG.ADMIN_EMAILS.includes(user.email?.toLowerCase() || '');

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

    const onFocus = () => fetchCount();
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [user, isDemo, location.pathname]);

  // Unread message badge: count conversations where the latest message is from the other person
  useEffect(() => {
    if (!user) { setUnreadMsgCount(0); return; }
    if (isDemo) { setUnreadMsgCount(0); return; }

    const fetchUnread = async () => {
      // Count distinct senders who have unread messages (read_at IS NULL)
      const { data } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('recipient_id', user.id)
        .is('read_at', null);

      if (!data || data.length === 0) { setUnreadMsgCount(0); return; }

      // Count unique senders with unread messages
      const uniqueSenders = new Set(data.map((m) => m.sender_id));
      setUnreadMsgCount(uniqueSenders.size);
    };

    fetchUnread();

    // Refresh on new incoming messages via realtime
    const channel = supabase
      .channel('navbar-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${user.id}` }, () => fetchUnread())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `recipient_id=eq.${user.id}` }, () => fetchUnread())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isDemo]);

  // Unauthenticated: minimal top bar
  if (!user) {
    return (
      <nav className="glass-effect px-6 py-4 border-b border-[var(--color-sand)]/60 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <img src={logoUrl} alt="Gravity" className="w-8 h-8 rounded-full object-cover" />
            <span className="font-serif text-xl text-[var(--color-text-header)]">{APP_CONFIG.APP_NAME}.</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/login" className="text-[11px] font-semibold text-[var(--color-steel-light)] uppercase tracking-widest hover:text-[var(--color-text-primary)] transition-colors">
              Log In
            </Link>
            <Link to="/onboarding" className="btn-primary px-5 py-2.5 text-[10px]">
              Get Started
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  // Authenticated: bottom tab bar
  const tabs = [
    {
      to: '/radar',
      label: 'Home',
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          {!active && <polyline points="9 22 9 12 15 12 15 22" />}
        </svg>
      ),
    },
    {
      to: '/connections',
      label: 'Network',
      badge: pendingCount || undefined,
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2' : '1.5'} strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      to: '/chat',
      label: 'Messages',
      badge: unreadMsgCount || undefined,
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      to: '/events',
      label: 'Events',
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      to: '/profile',
      label: 'Profile',
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2' : '1.5'} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Top bar — brand + admin */}
      <header className="glass-effect px-6 py-3.5 border-b border-[var(--color-sand)]/60 sticky top-0 z-50">
        <div className="max-w-lg mx-auto flex justify-between items-center">
          <Link to="/radar" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src={logoUrl} alt="Gravity" className="w-7 h-7 rounded-full object-cover" />
            <span className="font-serif text-lg text-[var(--color-text-header)]">{APP_CONFIG.APP_NAME}.</span>
          </Link>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link
                to="/admin"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  isActive('/admin')
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'border border-[var(--color-sand)] text-[var(--color-steel-light)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
                }`}
                aria-label="Admin"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10M6 20V4M18 20v-6" /></svg>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Bottom tab bar */}
      <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-50 glass-effect border-t border-[var(--color-sand)]/60 safe-bottom">
        <div className="max-w-lg mx-auto flex justify-around items-center py-2">
          {tabs.map((tab) => {
            const active = isActive(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                onClick={() => { if (!active) haptic('light'); }}
                aria-label={`${tab.label}${tab.badge ? ` (${tab.badge} new)` : ''}`}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-0.5 px-4 py-1.5 transition-colors ${
                  active
                    ? 'text-[var(--color-primary)]'
                    : 'text-[var(--color-steel-light)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <div className="relative">
                  {tab.icon(active)}
                  {tab.badge ? (
                    <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-[var(--color-error)] text-white text-[8px] font-bold rounded-full flex items-center justify-center animate-gentle-pulse">
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  ) : null}
                </div>
                <span className={`text-[10px] font-semibold ${active ? 'text-[var(--color-primary)]' : ''}`}>
                  {tab.label}
                </span>
                {active && (
                  <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-[var(--color-primary)]" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
