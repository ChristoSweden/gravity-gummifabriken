import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isDemoMode, enterDemoMode as setDemoFlag, exitDemoMode as clearDemoFlag } from '../services/supabaseService';
import { seedDemoData } from '../services/mockData';
import { captureError, captureMessage } from '../utils/errorTracking';

const DEMO_USER: User = {
  id: 'me-demo',
  email: 'demo@gravity.app',
  app_metadata: {},
  user_metadata: { full_name: 'Demo User' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
} as User;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isDemo: boolean;
  needsOnboarding: boolean;
  needsPasswordSetup: boolean;
  setNeedsOnboarding: (v: boolean) => void;
  setNeedsPasswordSetup: (v: boolean) => void;
  enterDemoMode: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);

  useEffect(() => {
    if (isDemoMode()) {
      setUser(DEMO_USER);
      setIsDemo(true);
      setLoading(false);
      return;
    }

    const getSession = async () => {
      try {
        const timeout = setTimeout(() => {
          if (loading) {
            captureMessage('Auth initialization timed out', { context: 'AuthContext.getSession' });
            setLoading(false);
          }
        }, 5000);

        const { data: { session } } = await supabase.auth.getSession();
        clearTimeout(timeout);
        setSession(session);
        setUser(session?.user || null);

        // Check if this authenticated user has a profile yet
        if (session?.user) {
          const { data } = await supabase
            .from('profiles')
            .select('interests')
            .eq('id', session.user.id)
            .maybeSingle();
          if (!data || !data.interests || data.interests.length < 3) {
            setNeedsOnboarding(true);
          }
        }
      } catch (error) {
        captureError(error, { context: 'AuthContext.getSession' });
      } finally {
        setLoading(false);
      }
    };

    getSession();

    // Proactive token refresh — refresh 5 minutes before expiry
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleTokenRefresh = (sess: Session | null) => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (!sess?.expires_at) return;
      const expiresMs = sess.expires_at * 1000;
      const refreshIn = expiresMs - Date.now() - 5 * 60 * 1000; // 5 min before expiry
      if (refreshIn > 0) {
        refreshTimer = setTimeout(async () => {
          const { error } = await supabase.auth.refreshSession();
          if (error) captureError(error, { context: 'AuthContext.refreshSession' });
        }, refreshIn);
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user || null);
        setLoading(false);
        scheduleTokenRefresh(session);

        if (event === 'PASSWORD_RECOVERY' && session?.user) {
          setNeedsPasswordSetup(true);
        }

        if (event === 'SIGNED_IN' && session?.user) {
          // Apply any pending profile data from pre-signup onboarding
          const raw = sessionStorage.getItem('gravity_pending_profile');
          if (raw) {
            try {
              const pending = JSON.parse(raw);
              const now = new Date().toISOString();
              await supabase.from('profiles').upsert({
                id: session.user.id,
                ...pending,
                is_present: true,
                last_seen_at: now,
                consent_given_at: now,
                updated_at: now,
              });
              setNeedsOnboarding(false);
            } catch (err) {
              captureError(err, { context: 'AuthContext.applyPendingProfile' });
            } finally {
              sessionStorage.removeItem('gravity_pending_profile');
            }
          } else {
            // Check if this user still needs onboarding
            const { data } = await supabase
              .from('profiles')
              .select('interests')
              .eq('id', session.user.id)
              .maybeSingle();
            setNeedsOnboarding(!data || !data.interests || data.interests.length < 3);

            // Auto-check-in on login so user immediately appears on radar
            if (data && data.interests && data.interests.length >= 3) {
              const now = new Date().toISOString();
              supabase.rpc('update_presence', { p_is_present: true, p_last_seen_at: now }).catch(() => {});
            }
          }
        }
      },
    );

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      authListener.subscription.unsubscribe();
    };
  }, []);

  const enterDemo = () => {
    setDemoFlag();
    seedDemoData();
    setUser(DEMO_USER);
    setIsDemo(true);
    setLoading(false);
  };

  const logout = async () => {
    // Clean up all realtime subscriptions
    supabase.removeAllChannels();
    if (isDemo) {
      clearDemoFlag();
      setUser(null);
      setIsDemo(false);
      setSession(null);
    } else {
      await supabase.auth.signOut();
    }
    setNeedsOnboarding(false);
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, isDemo, needsOnboarding, needsPasswordSetup, setNeedsOnboarding, setNeedsPasswordSetup, enterDemoMode: enterDemo, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
