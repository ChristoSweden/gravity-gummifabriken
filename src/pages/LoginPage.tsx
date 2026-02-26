import React, {useState, useEffect} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {supabase} from '../services/supabaseService';
import {useAuth} from '../contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const {user, loading} = useAuth();

  useEffect(() => {
    if (user && !loading) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const {error: signInError} = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      navigate('/'); // Navigate to home or dashboard on successful login
    }
  };

  if (loading || user) {
    return null; // Don't render login form if loading or already logged in
  }

  return (
    <div className="min-h-screen bg-[--color-secondary-bg] flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center">
        <h2 className="text-3xl font-bold text-[--color-text-dark] mb-6 font-serif">Login</h2>
        <form className="space-y-4" onSubmit={handleLogin}>
          <div>
            <input
              type="email"
              placeholder="Email"
              className="w-full p-3 rounded-lg border-2 border-[--color-border-light] focus:outline-none focus:border-[--color-accent-brown]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              className="w-full p-3 rounded-lg border-2 border-[--color-border-light] focus:outline-none focus:border-[--color-accent-brown]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[--color-accent-brown] text-white p-3 rounded-lg font-semibold hover:bg-opacity-90 transition-colors duration-200"
          >
            Sign In
          </button>
        </form>
        {error && <p className="text-red-500 mt-4">{error}</p>}
        <p className="mt-6 text-[--color-text-dark]">
          Don't have an account?{' '}
          <Link to="/register" className="text-[--color-accent-brown] hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
