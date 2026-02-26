import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';

export default function ProfilePage() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [interests, setInterests] = useState('');
  const [isIncognito, setIsIncognito] = useState(false);
  const [visibility, setVisibility] = useState('All of Gummifabriken');
  const [profileBlur, setProfileBlur] = useState(true);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      const fetchProfile = async () => {
        setLoading(true);
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, interests, is_incognito, visibility_setting, profile_blur')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          setError('Error loading profile.');
        } else if (data) {
          setFullName(data.full_name || '');
          setInterests(data.interests ? data.interests.join(', ') : '');
          setIsIncognito(data.is_incognito || false);
          setVisibility(data.visibility_setting || 'All of Gummifabriken');
          setProfileBlur(data.profile_blur !== undefined ? data.profile_blur : true);
        }
        setLoading(false);
      };
      fetchProfile();
    }
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!user) {
      setError('You must be logged in to update your profile.');
      return;
    }

    setLoading(true);
    const updates = {
      id: user.id,
      full_name: fullName,
      interests: interests.split(',').map((s) => s.trim()),
      is_incognito: isIncognito,
      visibility_setting: visibility,
      profile_blur: profileBlur,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase.from('profiles').upsert(updates);

    if (updateError) {
      setError(updateError.message);
    } else {
      setMessage('Profile updated successfully!');
    }
    setLoading(false);
  };

  const handleExportData = () => {
    const data = {
      user: user,
      profile: {
        fullName,
        interests,
        isIncognito,
        visibility,
        profileBlur
      }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gravity_data_${user?.id}.json`;
    a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[--color-bg-warm] p-8 text-[--color-steel] flex items-center justify-center font-brand">
        Loading profile...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[--color-bg-warm] p-8 text-[--color-steel] flex items-center justify-center font-brand">
        Please log in to view your profile.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[--color-bg-warm] p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="bg-white p-6 md:p-10 rounded-3xl shadow-xl border border-[--color-mist]">
          <h2 className="text-3xl font-brand font-bold text-[--color-primary] mb-8 uppercase tracking-tight">Your Core Profile</h2>

          <form onSubmit={handleUpdateProfile} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="fullName" className="block text-xs font-bold uppercase tracking-widest text-[--color-steel] opacity-60 mb-2">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  className="w-full p-4 rounded-xl border-2 border-[--color-mist] focus:outline-none focus:border-[--color-primary] transition-all"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[--color-steel] opacity-60 mb-2">
                  Identity (Email)
                </label>
                <input
                  type="email"
                  className="w-full p-4 rounded-xl border-2 border-[--color-mist] bg-[--color-bg-warm] opacity-50 cursor-not-allowed"
                  value={user.email || ''}
                  disabled
                />
              </div>
            </div>

            <div>
              <label htmlFor="interests" className="block text-xs font-bold uppercase tracking-widest text-[--color-steel] opacity-60 mb-2">
                Interests (comma-separated tags)
              </label>
              <textarea
                id="interests"
                className="w-full p-4 rounded-xl border-2 border-[--color-mist] focus:outline-none focus:border-[--color-primary] transition-all h-32"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                placeholder="e.g., Sustainability tech, UX, Manufacturing, AI"
              ></textarea>
            </div>

            <hr className="border-[--color-mist]" />

            <div className="space-y-4">
              <h3 className="text-xl font-brand font-bold text-[--color-steel] uppercase tracking-tight">Privacy Controls</h3>

              <div className="flex items-center justify-between p-4 bg-[--color-bg-warm] rounded-2xl">
                <div>
                  <p className="font-bold text-[--color-steel]">Incognito Mode</p>
                  <p className="text-xs text-[--color-steel] opacity-60">Browse without appearing on the radar.</p>
                </div>
                <input
                  type="checkbox"
                  checked={isIncognito}
                  onChange={(e) => setIsIncognito(e.target.checked)}
                  className="w-6 h-6 rounded border-[--color-mist] text-[--color-primary] focus:ring-[--color-primary]"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-[--color-bg-warm] rounded-2xl">
                <div>
                  <p className="font-bold text-[--color-steel]">Profile Blur</p>
                  <p className="text-xs text-[--color-steel] opacity-60">Blur profile for unconnected members.</p>
                </div>
                <input
                  type="checkbox"
                  checked={profileBlur}
                  onChange={(e) => setProfileBlur(e.target.checked)}
                  className="w-6 h-6 rounded border-[--color-mist] text-[--color-primary] focus:ring-[--color-primary]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[--color-steel] opacity-60 mb-2">
                  Visibility Range
                </label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="w-full p-4 rounded-xl border-2 border-[--color-mist] focus:outline-none focus:border-[--color-primary] transition-all"
                >
                  <option>All of Gummifabriken</option>
                  <option>Workspace only</option>
                  <option>Off</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[--color-primary] text-white py-4 rounded-xl font-bold text-lg hover:bg-opacity-90 transition-all shadow-md focus:ring-4 focus:ring-red-200"
              disabled={loading}
            >
              {loading ? 'Propagating changes...' : 'Secure & Save Profile'}
            </button>
          </form>

          {message && <div className="mt-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-r-lg text-green-700 font-medium">{message}</div>}
          {error && <div className="mt-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-700 font-medium">{error}</div>}
        </div>

        <div className="bg-white p-6 md:p-10 rounded-3xl shadow-xl border border-[--color-mist]">
          <h3 className="text-2xl font-brand font-bold text-[--color-steel] mb-4 uppercase tracking-tight">GDPR & Data Rights</h3>
          <p className="text-sm text-[--color-steel] opacity-60 mb-6">In accordance with Swedish DPA, you have full control over your data. All actions are instantaneous and irreversible.</p>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleExportData}
              className="flex-1 py-3 border-2 border-[--color-mist] rounded-xl font-bold text-[--color-steel] hover:bg-[--color-bg-warm] transition-all"
            >
              Export JSON Data
            </button>
            <button
              className="flex-1 py-3 border-2 border-red-100 text-red-600 rounded-xl font-bold hover:bg-red-50 transition-all"
            >
              Right to Erasure
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
