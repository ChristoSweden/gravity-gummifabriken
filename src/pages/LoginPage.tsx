import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseService';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, loading, enterDemoMode } = useAuth();

  useEffect(() => {
    if (user && !loading) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      navigate('/'); // Navigate to home or dashboard on successful login
    }
  };

  const handleDemoLogin = () => {
    enterDemoMode();
    navigate('/onboarding'); // Go to onboarding first for the full experience
  };

  if (loading || user) {
    return null; // Don't render login form if loading or already logged in
  }

  return (
    <div className="min-h-screen bg-[--color-bg-warm] flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center border border-[--color-mist]">
        <h2 className="text-3xl font-bold text-[--color-primary] mb-6 font-serif">Login</h2>
        <form className="space-y-4" onSubmit={handleLogin}>
          <div>
            <input
              type="email"
              placeholder="Email"
              className="w-full p-3 rounded-lg border-2 border-[--color-mist] focus:outline-none focus:border-[--color-primary]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              className="w-full p-3 rounded-lg border-2 border-[--color-mist] focus:outline-none focus:border-[--color-primary]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[--color-primary] text-white p-3 rounded-lg font-semibold hover:bg-opacity-90 transition-colors duration-200"
          >
            Sign In
          </button>
        </form>

        <div className="mt-6 flex flex-col space-y-3">
          <button
            onClick={handleDemoLogin}
            className="w-full bg-[--color-accent] text-white p-3 rounded-lg font-bold hover:bg-opacity-90 transition-all shadow-md flex items-center justify-center gap-2"
          >
            <span>🚀</span> Try Demo Mode
          </button>
        </div>

        {error && <p className="text-red-500 mt-4">{error}</p>}
        <p className="mt-6 text-[--color-steel]">
          Don't have an account?{' '}
          <Link to="/register" className="text-[--color-primary] hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
