import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseService';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
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
      setTimeout(() => navigate('/login'), 3000);
    } else {
      setMessage('Registration initiated. Please check your email for verification.');
      setTimeout(() => navigate('/login'), 3000);
    }
  };

  if (loading || user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[--color-bg-warm] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-8 max-w-md mx-auto w-full">
        <button onClick={() => navigate('/')} className="w-10 h-10 flex items-center justify-center text-[--color-steel] hover:opacity-100 transition-all hover:scale-110 active:scale-95">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <span className="font-serif text-3xl font-bold text-[--color-primary] drop-shadow-sm">Gravity.</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <header className="text-center mb-12">
            <h2 className="text-4xl font-serif text-[--color-text-header] uppercase tracking-tight mb-3">Join Nexus</h2>
            <p className="text-[11px] font-bold text-[--color-steel] opacity-40 uppercase tracking-[0.2em] leading-relaxed">
              Create your profile to access<br />exclusive professional circles
            </p>
          </header>

          <form className="space-y-6" onSubmit={handleRegister}>
            <div className="space-y-4 bg-white/70 backdrop-blur-md p-8 rounded-[2.5rem] shadow-premium border border-[--color-sand]">
              <div>
                <label className="text-[10px] font-bold text-[--color-steel] opacity-50 uppercase tracking-widest block mb-2 ml-1">Full Name</label>
                <input
                  type="text"
                  placeholder="Lex Lexington"
                  className="w-full bg-[--color-bg-warm]/50 border-none p-5 rounded-2xl text-sm font-sans outline-none focus:ring-4 focus:ring-[--color-primary]/10 transition-all"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[--color-steel] opacity-50 uppercase tracking-widest block mb-2 ml-1">Email Identifier</label>
                <input
                  type="email"
                  placeholder="name@nexus.com"
                  className="w-full bg-[--color-bg-warm]/50 border-none p-5 rounded-2xl text-sm font-sans outline-none focus:ring-4 focus:ring-[--color-primary]/10 transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[--color-steel] opacity-50 uppercase tracking-widest block mb-2 ml-1">Secure Key</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full bg-[--color-bg-warm]/50 border-none p-5 rounded-2xl text-sm font-sans outline-none focus:ring-4 focus:ring-[--color-primary]/10 transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[--color-primary] text-[--color-text-header] py-6 rounded-full font-serif text-lg font-bold uppercase tracking-widest shadow-premium hover:scale-[1.02] active:scale-95 transition-all mt-4"
            >
              Initialize Profile
            </button>
          </form>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-[10px] font-bold uppercase tracking-wider mt-6 text-center"
            >
              {error}
            </motion.p>
          )}
          {message && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-green-600 text-[10px] font-bold uppercase tracking-wider mt-6 text-center"
            >
              {message}
            </motion.p>
          )}

          <div className="mt-12 text-center space-y-6">
            <p className="text-[10px] font-bold text-[--color-steel] opacity-40 uppercase tracking-widest">
              Already a member?{' '}
              <Link to="/login" className="text-[--color-primary] hover:opacity-100 transition-all font-black underline underline-offset-4 ml-1">
                Authorized Login
              </Link>
            </p>
            <button
              onClick={() => navigate('/login')}
              className="text-[10px] font-bold text-[--color-steel] opacity-30 uppercase tracking-[0.2em] hover:opacity-60 transition-all active:scale-95"
            >
              Or explore Nexus in Demo Mode
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
