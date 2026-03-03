import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseService';
import { useAuth } from '../contexts/AuthContext';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(''); // Added for name input
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user && !loading) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        },
      },
    });

    if (error) {
      setError(error.message);
    } else if (data.user) {
      setMessage('Registration successful! Please check your email to verify your account.');
      // Optionally navigate to login or a success page after a short delay
      setTimeout(() => navigate('/login'), 3000);
    } else {
      setMessage('Registration initiated. Please check your email for verification.');
      setTimeout(() => navigate('/login'), 3000);
    }
  };

  if (loading || user) {
    return null; // Don't render register form if loading or already logged in
  }

  return (
    <div className="min-h-screen bg-[--color-bg-warm] flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center border border-[--color-mist]">
        <h2 className="text-3xl font-bold text-[--color-primary] mb-6 font-serif">Register</h2>
        <form className="space-y-4" onSubmit={handleRegister}>
          <div>
            <input
              type="text"
              placeholder="Name"
              className="w-full p-3 rounded-lg border-2 border-[--color-mist] focus:outline-none focus:border-[--color-primary]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
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
            Register
          </button>
        </form>
        {error && <p className="text-red-500 mt-4">{error}</p>}
        {message && <p className="text-green-500 mt-4">{message}</p>}
        <p className="mt-6 text-[--color-steel] flex flex-col space-y-2">
          <span>
            Already have an account?{' '}
            <Link to="/login" className="text-[--color-primary] hover:underline font-bold">
              Login
            </Link>
          </span>
          <button
            onClick={() => navigate('/login')}
            className="text-sm text-[--color-accent] hover:underline"
          >
            Or try the Demo Mode
          </button>
        </p>
      </div>
    </div>
  );
}
