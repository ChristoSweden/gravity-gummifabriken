import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="bg-[--color-bg-warm] p-4 text-[--color-steel] shadow-sm border-b border-[--color-mist] sticky top-0 z-50">
      <div className="container mx-auto flex justify-between items-center">
        <Link to={user ? '/radar' : '/'} className="text-2xl font-brand text-[--color-primary] tracking-tight">
          Gravity
        </Link>
        <div className="flex items-center space-x-6">
          {user ? (
            <>
              <Link
                to="/radar"
                className="text-sm font-medium hover:text-[--color-primary] transition-colors duration-200"
              >
                Radar
              </Link>
              <Link
                to="/connections"
                className="text-sm font-medium hover:text-[--color-primary] transition-colors duration-200"
              >
                Connections
              </Link>
              <Link
                to="/profile"
                className="text-sm font-medium hover:text-[--color-primary] transition-colors duration-200"
              >
                Profile
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-red-600 hover:text-red-800 transition-colors duration-200"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-sm font-medium hover:text-[--color-primary] transition-colors duration-200"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="bg-[--color-primary] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-opacity-90 transition-colors duration-200"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
