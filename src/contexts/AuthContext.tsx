import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isDemoMode, enterDemoMode as setDemoFlag, exitDemoMode as clearDemoFlag } from '../services/supabaseService';
import { seedDemoData } from '../services/mockData';

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
  setNeedsOnboarding: (v: boolean) => void;
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
            console.warn('Auth initialization timed out. Proceeding to app...');
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
        console.error('Failed to get session:', error);
      } finally {
        setLoading(false);
      }
    };

    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user || null);
        setLoading(false);

        if (event === 'SIGNED_IN' && session?.user) {
          // Apply any pending profile data from pre-signup onboarding
          const raw = sessionStorage.getItem('gravity_pending_profile');
          if (raw) {
            try {
              const pending = JSON.parse(raw);
              await supabase.from('profiles').upsert({
                id: session.user.id,
                ...pending,
                consent_given_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
              setNeedsOnboarding(false);
            } catch {
              // non-fatal
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
          }
        }
      },
    );

    return () => {
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
    <AuthContext.Provider value={{ session, user, loading, isDemo, needsOnboarding, setNeedsOnboarding, enterDemoMode: enterDemo, logout }}>
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
