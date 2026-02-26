import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [hasInterests, setHasInterests] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }

    const checkProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('interests')
        .eq('id', user.id)
        .single();

      setHasInterests(data?.interests && data.interests.length >= 3);
      setChecking(false);
    };

    checkProfile();
  }, [user]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen bg-[--color-bg-warm] flex items-center justify-center">
        <div className="animate-pulse font-brand text-xl text-[--color-primary]">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If user hasn't completed onboarding and isn't already on the onboarding page
  if (!hasInterests && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
