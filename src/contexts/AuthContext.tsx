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
  enterDemoMode: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    // Check if we were in demo mode (session storage persists across page reloads within tab)
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
      } catch (error) {
        console.error('Failed to get session:', error);
      } finally {
        setLoading(false);
      }
    };

    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user || null);
        setLoading(false);
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
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, isDemo, enterDemoMode: enterDemo, logout }}>
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
