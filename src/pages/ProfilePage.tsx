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
  const [editing, setEditing] = useState(false);
  const [networkCount, setNetworkCount] = useState(0);
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
        setNetworkCount(0);
        setLoading(false);
        return;
      }

      const [{ data, error: fetchErr }, { count }] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, profession, company, interests, intent, gps_enabled, notifications_enabled, is_incognito, profile_blur, avatar_url')
          .eq('id', user.id)
          .single(),
        supabase
          .from('connections')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'accepted')
          .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`),
      ]);

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
      setNetworkCount(count || 0);
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
      setEditing(false);
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
    else { setMessage('Profile saved'); setEditing(false); setTimeout(() => setMessage(null), 3000); }
    setSaving(false);
  };

  const autoSaveToggle = async (field: string, value: boolean) => {
    if (!user || isDemo) return;
    await supabase.from('profiles').update({
      [field]: value,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);
    setMessage('Settings saved');
    setTimeout(() => setMessage(null), 2000);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || isDemo) return;

    setUploadingAvatar(true);
    setError(null);

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

  const SettingsRow = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 py-4 text-left hover:bg-[var(--color-mist)]/50 transition-colors -mx-1 px-1 rounded-lg"
    >
      <span className="text-[var(--color-steel-light)]">{icon}</span>
      <span className="flex-1 text-[15px] text-[var(--color-text-primary)]">{label}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
    </button>
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] pb-28">
      {/* Copper banner */}
      <div className="h-24 bg-[var(--color-primary)]" />

      {/* Avatar overlapping banner */}
      <div className="max-w-lg mx-auto px-6 -mt-12">
        <div className="flex flex-col items-center mb-6">
          <div className="relative group mb-3">
            <div className="w-24 h-24 rounded-2xl overflow-hidden border-4 border-[var(--color-bg-warm)] shadow-lg">
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
              className="absolute bottom-0 right-0 w-8 h-8 bg-[var(--color-primary)] text-white rounded-full flex items-center justify-center border-2 border-[var(--color-bg-warm)] hover:bg-[var(--color-primary-dark)] transition-colors"
            >
              {uploadingAvatar ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          <h2 className="font-serif text-2xl text-[var(--color-text-header)]">{fullName || 'Your Name'}</h2>
          <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5">
            {[profession, company].filter(Boolean).join(' · ') || 'Add your role'}
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="bg-[var(--color-mist)] border border-[var(--color-sand)] rounded-2xl p-4 text-center">
            <div className="font-serif text-2xl text-[var(--color-primary)]">{networkCount}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-steel-light)] mt-1">Network</div>
          </div>
          <div className="bg-[var(--color-mist)] border border-[var(--color-sand)] rounded-2xl p-4 text-center">
            <div className="font-serif text-2xl text-[var(--color-primary)]">{interestTags.length}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-steel-light)] mt-1">Interests</div>
          </div>
        </div>

        {/* Toast */}
        {(message || error) && (
          <div className={`mb-6 px-4 py-3 rounded-[var(--radius-md)] text-sm font-medium ${
            message ? 'bg-[var(--color-success)]/8 text-[var(--color-success)] border border-[var(--color-success)]/15' : 'bg-[var(--color-error)]/5 text-[var(--color-error)] border border-[var(--color-error)]/15'
          }`}>
            {message || error}
          </div>
        )}

        {/* Interests & Intent section */}
        <section className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-label">Interests & Intent</h3>
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-primary)] border border-[var(--color-primary)]/20 px-3 py-1 rounded-full hover:bg-[var(--color-primary)]/5 transition-colors"
            >
              {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>

          {editing ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="section-label block mb-1.5">Full Name</label>
                <input type="text" className="input-field" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="section-label block mb-1.5">Profession</label>
                  <input type="text" className="input-field" value={profession} onChange={(e) => setProfession(e.target.value)} placeholder="e.g. Designer" />
                </div>
                <div>
                  <label className="section-label block mb-1.5">Company</label>
                  <input type="text" className="input-field" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Optional" />
                </div>
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
              </div>
              <div>
                <label className="section-label block mb-1.5">Professional Intent</label>
                <textarea className="input-field min-h-[64px] resize-none" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="What are you looking for?" />
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full py-3.5 text-xs">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="section-label mb-2">Core Interests</p>
                <div className="flex flex-wrap gap-1.5">
                  {interestTags.length > 0 ? interestTags.map((tag) => (
                    <span key={tag} className="text-[12px] font-medium text-[var(--color-text-primary)] bg-[var(--color-mist)] border border-[var(--color-sand)] px-3 py-1 rounded-full">
                      {tag}
                    </span>
                  )) : (
                    <p className="text-sm text-[var(--color-text-secondary)] italic">No interests added yet</p>
                  )}
                </div>
              </div>
              {intent && (
                <div>
                  <p className="section-label mb-2">Professional Intent</p>
                  <p className="text-[14px] text-[var(--color-text-primary)] italic leading-relaxed">"{intent}"</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* App Settings */}
        <section className="card p-5 mb-6">
          <SettingsRow
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>}
            label="App Settings"
            onClick={() => setEditing(true)}
          />
          <div className="section-divider" />
          <div className="py-2">
            <Toggle value={gpsEnabled} onToggle={() => { const v = !gpsEnabled; setGpsEnabled(v); autoSaveToggle('gps_enabled', v); }} label="GPS Location" desc={`Detect proximity to ${APP_CONFIG.LOCATION_NAME}`} />
            <div className="section-divider my-1" />
            <Toggle value={notificationsEnabled} onToggle={() => { const v = !notificationsEnabled; setNotificationsEnabled(v); autoSaveToggle('notifications_enabled', v); }} label="Notifications" desc="Get notified on connection requests" />
          </div>
        </section>

        {/* Privacy Settings */}
        <section className="card p-5 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span className="text-[15px] font-medium text-[var(--color-text-primary)]">Privacy Settings</span>
          </div>
          <Toggle value={isIncognito} onToggle={() => { const v = !isIncognito; setIsIncognito(v); autoSaveToggle('is_incognito', v); }} label="Incognito Mode" desc="Hide your profile from the radar" />
          <div className="section-divider my-1" />
          <Toggle value={profileBlur} onToggle={() => { const v = !profileBlur; setProfileBlur(v); autoSaveToggle('profile_blur', v); }} label="Profile Blur" desc="Blur details for unconnected users" />
        </section>

        {/* GDPR Compliance */}
        <section className="card p-5 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span className="text-[15px] font-medium text-[var(--color-text-primary)]">GDPR Compliance</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleExportData} className="btn-secondary py-3 text-xs">
              Export Data
            </button>
            <button
              onClick={handleDeleteAccount}
              className="py-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-error)] border border-[var(--color-error)]/15 rounded-full hover:bg-[var(--color-error)]/5 transition-colors"
            >
              Delete Account
            </button>
          </div>
        </section>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          className="w-full mb-4 py-3 text-sm font-medium text-[var(--color-error)] hover:text-[var(--color-error)]/80 transition-colors"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
