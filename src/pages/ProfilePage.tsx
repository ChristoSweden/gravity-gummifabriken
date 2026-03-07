import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { getDemoProfile, setDemoProfile, setDemoInterests } from '../services/mockData';
import { APP_CONFIG } from '../config/appConfig';

function resizeImage(file: File, maxDim: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else { w = Math.round((w * maxDim) / h); h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.85);
    };
    img.src = URL.createObjectURL(file);
  });
}

export default function ProfilePage() {
  const { user, isDemo, logout } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [profession, setProfession] = useState('');
  const [company, setCompany] = useState('');
  const [interestTags, setInterestTags] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState('');
  const [intent, setIntent] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isIncognito, setIsIncognito] = useState(false);
  const [profileBlur, setProfileBlur] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      setLoading(true);

      if (isDemo) {
        const profile = getDemoProfile();
        setFullName(profile.full_name || '');
        setProfession(profile.profession || '');
        setCompany(profile.company || '');
        setInterestTags(profile.interests || []);
        setIntent(profile.intent || '');
        setLoading(false);
        return;
      }

      const { data, error: fetchErr } = await supabase
        .from('profiles')
        .select('full_name, profession, company, interests, intent, gps_enabled, notifications_enabled, is_incognito, profile_blur, avatar_url')
        .eq('id', user.id)
        .single();

      if (fetchErr) {
        setError('Could not load profile.');
      } else if (data) {
        setFullName(data.full_name || '');
        setProfession(data.profession || '');
        setCompany(data.company || '');
        setInterestTags(data.interests || []);
        setIntent(data.intent || '');
        setAvatarUrl(data.avatar_url || null);
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
      setDemoInterests(interestTags);
      setMessage('Profile updated');
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    const { error: updateError } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: fullName, profession, company,
      interests: interestTags,
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || isDemo) return;

    setUploadingAvatar(true);
    setError(null);

    // Client-side resize to max 512px for fast uploads
    const resized = await resizeImage(file, 512);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, resized, { upsert: true, contentType: resized.type });

    if (uploadErr) {
      setError('Photo upload failed. Try a smaller image.');
      setUploadingAvatar(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
    setAvatarUrl(publicUrl);
    setUploadingAvatar(false);
    setMessage('Photo updated');
    setTimeout(() => setMessage(null), 3000);
  };

  const addInterestTag = (value: string) => {
    const tag = value.trim();
    if (tag && !interestTags.includes(tag)) {
      setInterestTags([...interestTags, tag]);
    }
    setInterestInput('');
  };

  const removeInterestTag = (tag: string) => {
    setInterestTags(interestTags.filter((t) => t !== tag));
  };

  const handleInterestKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && interestInput.trim()) {
      e.preventDefault();
      addInterestTag(interestInput);
    } else if (e.key === 'Backspace' && !interestInput && interestTags.length > 0) {
      setInterestTags(interestTags.slice(0, -1));
    }
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

    // delete_user() is SECURITY DEFINER — deletes auth.users row which
    // CASCADEs to profiles, connections, and messages (full GDPR erasure).
    const { error: deleteError } = await supabase.rpc('delete_user');
    if (deleteError) {
      setError('Account deletion failed. Please contact support.');
      return;
    }
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-warm)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="section-label">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-warm)] flex items-center justify-center px-6">
        <div className="card p-10 text-center max-w-sm">
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">Please log in to view your profile.</p>
          <button onClick={() => navigate('/login')} className="btn-primary px-8 py-3 text-xs">Log In</button>
        </div>
      </div>
    );
  }

  const Toggle = ({ value, onToggle, label, desc }: { value: boolean; onToggle: () => void; label: string; desc: string }) => (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-[15px] font-medium text-[var(--color-text-primary)]">{label}</p>
        <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5">{desc}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative w-12 h-7 rounded-full transition-colors duration-200 flex-shrink-0 ml-4 ${value ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-sand)]'}`}
        aria-label={`Toggle ${label}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-200 ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] pb-24">
      <div className="max-w-lg mx-auto px-6 pt-8">
        {/* Header */}
        <header className="mb-8">
          <h2 className="font-serif text-3xl text-[var(--color-text-header)] mb-1">Profile</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">Identity, privacy & settings</p>
        </header>

        {/* Toast */}
        {(message || error) && (
          <div className={`mb-6 px-4 py-3 rounded-[var(--radius-md)] text-sm font-medium ${
            message ? 'bg-[var(--color-success)]/8 text-[var(--color-success)] border border-[var(--color-success)]/15' : 'bg-[var(--color-error)]/5 text-[var(--color-error)] border border-[var(--color-error)]/15'
          }`}>
            {message || error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-8">
          {/* Avatar */}
          <section className="flex flex-col items-center mb-2">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[var(--color-sand)] shadow-md">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-[var(--color-primary)] flex items-center justify-center text-white font-serif text-3xl">
                    {fullName.charAt(0) || '?'}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar || isDemo}
                className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                </svg>
              </button>
              {uploadingAvatar && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            <p className="text-[11px] text-[var(--color-text-secondary)] mt-2">Tap to change photo</p>
          </section>

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
                <div className="input-field !p-2 flex flex-wrap gap-1.5 min-h-[48px] items-center cursor-text" onClick={() => document.getElementById('interest-input')?.focus()}>
                  {interestTags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-primary-dark)] bg-[var(--color-primary)]/8 pl-2.5 pr-1.5 py-1 rounded-full border border-[var(--color-primary)]/10">
                      {tag}
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeInterestTag(tag); }} className="w-4 h-4 rounded-full hover:bg-[var(--color-primary)]/15 flex items-center justify-center transition-colors">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}
                  <input
                    id="interest-input"
                    type="text"
                    className="flex-1 min-w-[80px] outline-none bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-steel-light)]/50"
                    value={interestInput}
                    onChange={(e) => setInterestInput(e.target.value)}
                    onKeyDown={handleInterestKeyDown}
                    onBlur={() => { if (interestInput.trim()) addInterestTag(interestInput); }}
                    placeholder={interestTags.length === 0 ? 'Type and press Enter...' : ''}
                  />
                </div>
                <p className="text-[11px] text-[var(--color-text-secondary)] mt-1">Press Enter or comma to add</p>
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
        <section className="mt-12 pt-8 border-t border-[var(--color-sand)]">
          <h3 className="section-label mb-4">Data & Privacy</h3>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleExportData} className="btn-secondary py-3 text-xs">
              Export Data
            </button>
            <button
              onClick={handleDeleteAccount}
              className="py-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-error)] border-1.5 border-[var(--color-error)]/15 rounded-full hover:bg-[var(--color-error)]/5 transition-colors"
            >
              Delete Account
            </button>
          </div>
        </section>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          className="w-full mt-6 mb-4 py-3 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
