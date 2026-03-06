import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { getDemoProfile, setDemoProfile, setDemoInterests } from '../services/mockData';
import { APP_CONFIG } from '../config/appConfig';

export default function ProfilePage() {
  const { user, isDemo, logout } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [profession, setProfession] = useState('');
  const [company, setCompany] = useState('');
  const [interests, setInterests] = useState('');
  const [intent, setIntent] = useState('');
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isIncognito, setIsIncognito] = useState(false);
  const [profileBlur, setProfileBlur] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      setLoading(true);

      if (isDemo) {
        const profile = getDemoProfile();
        setFullName(profile.full_name || '');
        setProfession(profile.profession || '');
        setCompany(profile.company || '');
        setInterests(profile.interests ? profile.interests.join(', ') : '');
        setIntent(profile.intent || '');
        setLoading(false);
        return;
      }

      const { data, error: fetchErr } = await supabase
        .from('profiles')
        .select('full_name, profession, company, interests, intent, gps_enabled, notifications_enabled, is_incognito, profile_blur')
        .eq('id', user.id)
        .single();

      if (fetchErr) {
        setError('Could not load profile.');
      } else if (data) {
        setFullName(data.full_name || '');
        setProfession(data.profession || '');
        setCompany(data.company || '');
        setInterests(data.interests ? data.interests.join(', ') : '');
        setIntent(data.intent || '');
        setGpsEnabled(data.gps_enabled ?? true);
        setNotificationsEnabled(data.notifications_enabled ?? true);
        setIsIncognito(data.is_incognito || false);
        setProfileBlur(data.profile_blur ?? true);
      }
      setLoading(false);
    };

    fetchProfile();
  }, [user, isDemo]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setMessage(null);
    setError(null);
    setSaving(true);

    if (isDemo) {
      setDemoProfile(fullName, profession, company);
      setDemoInterests(interests.split(',').map((s) => s.trim()).filter(Boolean));
      setMessage('Profile updated');
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    const { error: updateError } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: fullName, profession, company,
      interests: interests.split(',').map((s) => s.trim()).filter(Boolean),
      intent,
      gps_enabled: gpsEnabled,
      notifications_enabled: notificationsEnabled,
      is_incognito: isIncognito,
      profile_blur: profileBlur,
      updated_at: new Date().toISOString(),
    });

    if (updateError) setError(updateError.message);
    else { setMessage('Profile saved'); setTimeout(() => setMessage(null), 3000); }
    setSaving(false);
  };

  const handleExportData = async () => {
    if (isDemo) {
      const profile = getDemoProfile();
      const blob = new Blob([JSON.stringify({ profile }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'gravity_data_demo.json'; a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (!user) return;

    const [{ data: profile }, { data: connections }, { data: messages }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('connections').select('*').or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`),
      supabase.from('messages').select('*').or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`),
    ]);

    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), user: { id: user.id, email: user.email }, profile, connections, messages }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gravity_data_${user.id}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAccount = async () => {
    if (isDemo) { await logout(); navigate('/'); return; }
    if (!user) return;
    if (!window.confirm('This will permanently delete your account and all data. This cannot be undone.')) return;

    await supabase.from('profiles').delete().eq('id', user.id);
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[--color-bg-warm] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-[--color-primary] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="section-label">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[--color-bg-warm] flex items-center justify-center px-6">
        <div className="card p-10 text-center max-w-sm">
          <p className="text-sm text-[--color-text-secondary] mb-4">Please log in to view your profile.</p>
          <button onClick={() => navigate('/login')} className="btn-primary px-8 py-3 text-xs">Log In</button>
        </div>
      </div>
    );
  }

  const Toggle = ({ value, onToggle, label, desc }: { value: boolean; onToggle: () => void; label: string; desc: string }) => (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-[15px] font-medium text-[--color-text-primary]">{label}</p>
        <p className="text-[13px] text-[--color-text-secondary] mt-0.5">{desc}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative w-12 h-7 rounded-full transition-colors duration-200 flex-shrink-0 ml-4 ${value ? 'bg-[--color-primary]' : 'bg-[--color-sand]'}`}
        aria-label={`Toggle ${label}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-200 ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[--color-bg-warm] pb-24">
      <div className="max-w-lg mx-auto px-6 pt-8">
        {/* Header */}
        <header className="mb-8">
          <h2 className="font-serif text-3xl text-[--color-text-header] mb-1">Profile</h2>
          <p className="text-sm text-[--color-text-secondary]">Identity, privacy & settings</p>
        </header>

        {/* Toast */}
        {(message || error) && (
          <div className={`mb-6 px-4 py-3 rounded-[--radius-md] text-sm font-medium ${
            message ? 'bg-[--color-success]/8 text-[--color-success] border border-[--color-success]/15' : 'bg-[--color-error]/5 text-[--color-error] border border-[--color-error]/15'
          }`}>
            {message || error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-8">
          {/* Identity */}
          <section>
            <h3 className="section-label mb-4">Identity</h3>
            <div className="card p-5 space-y-4">
              <div>
                <label className="section-label block mb-1.5">Full Name</label>
                <input type="text" className="input-field" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div>
                <label className="section-label block mb-1.5">Profession</label>
                <input type="text" className="input-field" value={profession} onChange={(e) => setProfession(e.target.value)} placeholder="e.g. Software Engineer" />
              </div>
              <div>
                <label className="section-label block mb-1.5">Company</label>
                <input type="text" className="input-field" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="section-label block mb-1.5">Interests</label>
                <textarea className="input-field min-h-[72px] resize-none" value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="Comma-separated: AI, UX Design, SaaS..." />
              </div>
              <div>
                <label className="section-label block mb-1.5">Intent</label>
                <textarea className="input-field min-h-[64px] resize-none" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="What are you looking for?" />
              </div>
            </div>
          </section>

          {/* Proximity */}
          <section>
            <h3 className="section-label mb-4">Proximity</h3>
            <div className="card p-5">
              <Toggle value={gpsEnabled} onToggle={() => setGpsEnabled(!gpsEnabled)} label="GPS Location" desc={`Detect proximity to ${APP_CONFIG.LOCATION_NAME}`} />
              <div className="section-divider my-1" />
              <Toggle value={notificationsEnabled} onToggle={() => setNotificationsEnabled(!notificationsEnabled)} label="Notifications" desc="Get notified on connection requests" />
            </div>
          </section>

          {/* Privacy */}
          <section>
            <h3 className="section-label mb-4">Privacy</h3>
            <div className="card p-5">
              <Toggle value={isIncognito} onToggle={() => setIsIncognito(!isIncognito)} label="Incognito Mode" desc="Hide your profile from the radar" />
              <div className="section-divider my-1" />
              <Toggle value={profileBlur} onToggle={() => setProfileBlur(!profileBlur)} label="Profile Blur" desc="Blur details for unconnected users" />
            </div>
          </section>

          {/* Save */}
          <button type="submit" disabled={saving} className="btn-primary w-full py-4 text-sm">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>

        {/* Data & Privacy */}
        <section className="mt-12 pt-8 border-t border-[--color-sand]">
          <h3 className="section-label mb-4">Data & Privacy</h3>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleExportData} className="btn-secondary py-3 text-xs">
              Export Data
            </button>
            <button
              onClick={handleDeleteAccount}
              className="py-3 text-xs font-semibold uppercase tracking-widest text-[--color-error] border-1.5 border-[--color-error]/15 rounded-full hover:bg-[--color-error]/5 transition-colors"
            >
              Delete Account
            </button>
          </div>
        </section>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          className="w-full mt-6 mb-4 py-3 text-sm text-[--color-text-secondary] hover:text-[--color-text-primary] transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
