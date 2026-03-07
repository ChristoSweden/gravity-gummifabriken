import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import logoUrl from '../assets/logo.png';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { MOCK_USERS, getDemoProfile, isConnectedInDemo, addDemoConnection, addDemoMessage } from '../services/mockData';
import { getInterestOverlap } from '../utils/matching';
import { track } from '@vercel/analytics';
import { APP_CONFIG } from '../config/appConfig';
import { motion, AnimatePresence } from 'motion/react';

const MOCK_DISTANCES: Record<string, number> = {
  'user-1': 45,
  'user-2': 90,
  'user-3': 90,
  'user-4': 150,
  'user-5': 120,
};

interface Profile {
  id: string;
  full_name: string;
  interests: string[];
  profession?: string;
  company?: string;
  avatar_url?: string;
}

type MatchProfile = Profile & { overlap: string[]; distance_m: number };

interface ConnectionStatus {
  [userId: string]: 'none' | 'pending_sent' | 'pending_received' | 'accepted';
}

// Blurred silhouette for GDPR-protected profiles
function BlurredAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';
  return (
    <div className={`${dim} rounded-full bg-[var(--color-sand)] flex items-center justify-center flex-shrink-0 overflow-hidden`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="1.5" className="w-2/3 h-2/3">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </div>
  );
}

export default function CampusRadarPage() {
  const { user, isDemo } = useAuth();
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [connectionStatuses, setConnectionStatuses] = useState<ConnectionStatus>({});
  const [loading, setLoading] = useState(true);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<MatchProfile | null>(null);
  const [invitationMessage, setInvitationMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);

    if (isDemo) {
      const me = getDemoProfile();
      const others = MOCK_USERS;
      setUserProfile(me as Profile);

      const withOverlap: MatchProfile[] = others
        .map((p) => ({
          ...p,
          overlap: getInterestOverlap(me as Profile, p as Profile),
          distance_m: MOCK_DISTANCES[p.id] ?? 100,
        }))
        .filter((p) => p.overlap.length > 0)
        .sort((a, b) => b.overlap.length - a.overlap.length);

      setMatches(withOverlap);

      const statuses: ConnectionStatus = {};
      others.forEach((p) => { statuses[p.id] = isConnectedInDemo(p.id); });
      setConnectionStatuses(statuses);
      setLoading(false);
      return;
    }

    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('id, full_name, interests, profession, company, is_incognito');

    if (pError || !profiles) {
      setError('Unable to load nearby profiles. Please try again.');
      setLoading(false);
      return;
    }

    const me = profiles.find((p) => p.id === user.id);
    const others = profiles.filter((p) => p.id !== user.id && !p.is_incognito);
    setUserProfile(me || null);

    if (me?.interests) {
      const withOverlap: MatchProfile[] = others
        .map((p, idx) => ({
          ...p,
          overlap: getInterestOverlap(me as Profile, p as Profile),
          distance_m: 30 + idx * 35,
        }))
        .filter((p) => p.overlap.length > 0)
        .sort((a, b) => b.overlap.length - a.overlap.length);
      setMatches(withOverlap);
    }

    const { data: connections } = await supabase
      .from('connections')
      .select('*')
      .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

    const statuses: ConnectionStatus = {};
    (connections || []).forEach((c: any) => {
      const otherId = c.requester_id === user.id ? c.recipient_id : c.requester_id;
      if (c.status === 'accepted') statuses[otherId] = 'accepted';
      else if (c.status === 'pending') statuses[otherId] = c.requester_id === user.id ? 'pending_sent' : 'pending_received';
    });
    setConnectionStatuses(statuses);
    setLoading(false);
  }, [user, isDemo]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('radar-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const handleSendRequest = async () => {
    if (!selectedMatch) return;
    const recipientId = selectedMatch.id;

    const currentStatus = connectionStatuses[recipientId];
    if (currentStatus && currentStatus !== 'none') {
      setSelectedMatch(null);
      setInvitationMessage('');
      return;
    }

    setSendingTo(recipientId);
    setError(null);

    if (isDemo) {
      addDemoConnection(recipientId);
      if (invitationMessage.trim()) addDemoMessage(recipientId, invitationMessage.trim());
      setConnectionStatuses((prev) => ({ ...prev, [recipientId]: 'pending_sent' }));
      setSendingTo(null);
      setSelectedMatch(null);
      setInvitationMessage('');
      setShowSuccess(true);
      track('connection_request_sent', { mode: 'demo', target_id: recipientId });
      setTimeout(() => setShowSuccess(false), 3000);
      return;
    }

    if (!user) return;

    const { error: connError } = await supabase.from('connections').insert({
      requester_id: user.id,
      recipient_id: recipientId,
    });

    if (connError) {
      setError(connError.message.includes('duplicate') || connError.message.includes('reverse')
        ? 'Connection already exists.'
        : 'Failed to send request. Please try again.');
      setSendingTo(null);
      setSelectedMatch(null);
      setInvitationMessage('');
      return;
    }

    if (invitationMessage.trim()) {
      await supabase.from('messages').insert({
        sender_id: user.id,
        recipient_id: recipientId,
        content: invitationMessage.trim(),
      });
    }

    setConnectionStatuses((prev) => ({ ...prev, [recipientId]: 'pending_sent' }));
    setShowSuccess(true);
    track('connection_request_sent', { mode: 'live', target_id: recipientId });
    setTimeout(() => setShowSuccess(false), 3000);
    setSendingTo(null);
    setSelectedMatch(null);
    setInvitationMessage('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-warm)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="section-label">Scanning nearby...</p>
        </div>
      </div>
    );
  }

  const pendingReceivedCount = Object.values(connectionStatuses).filter(s => s === 'pending_received').length;

  const pipLayout = [
    { angle: 30,  r: 42 },
    { angle: 100, r: 68 },
    { angle: 170, r: 90 },
    { angle: 220, r: 56 },
    { angle: 290, r: 80 },
    { angle: 350, r: 105 },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] pb-24">
      <div className="max-w-lg mx-auto px-6 pt-8">

        {/* ── Pending connection request banner ── */}
        <AnimatePresence>
          {pendingReceivedCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6"
            >
              <Link to="/connections">
                <div className="bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/40 rounded-2xl px-4 py-3.5 flex items-center gap-3">
                  <span className="w-2.5 h-2.5 bg-[var(--color-accent)] rounded-full animate-gentle-pulse flex-shrink-0" />
                  <p className="text-sm font-semibold text-[var(--color-text-header)] flex-1">
                    {pendingReceivedCount} connection request{pendingReceivedCount !== 1 ? 's' : ''} waiting
                  </p>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </div>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="text-center mb-8">
          <h2 className="font-serif text-3xl text-[var(--color-text-header)] mb-1">Radar</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {APP_CONFIG.RADAR_RADIUS} radius at {APP_CONFIG.LOCATION_NAME}
          </p>
        </header>

        {/* Radar Visual */}
        <div className="relative w-72 h-72 mx-auto mb-12">
          <div
            className="absolute inset-0 rounded-full border border-[var(--color-sand)]"
            style={{ background: 'radial-gradient(circle, rgba(184,115,51,0.06) 0%, rgba(184,115,51,0.02) 40%, transparent 70%)' }}
          >
            {[0.72, 0.44].map((scale, i) => (
              <div key={i} className="absolute inset-0 border border-[var(--color-sand)]/40 rounded-full" style={{ transform: `scale(${scale})` }} />
            ))}
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-px bg-[var(--color-sand)]/30" />
            <div className="absolute left-0 right-0 top-1/2 -translate-y-px h-px bg-[var(--color-sand)]/30" />
            <div className="absolute inset-0 rounded-full animate-scan origin-center pointer-events-none z-10">
              <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, rgba(184,115,51,0.18) 0deg, transparent 45deg)' }} />
              <div className="absolute top-0 left-1/2 -translate-x-px w-0.5 h-1/2 bg-[var(--color-primary)]/50 origin-bottom" />
            </div>
            <div className="absolute inset-0 rounded-full border border-[var(--color-primary)]/20 animate-radar-pulse" />
          </div>

          {/* Center logo */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
            <img src={logoUrl} alt="Gravity" className="w-10 h-10 rounded-full object-cover shadow-[0_0_20px_rgba(184,115,51,0.4)] border-2 border-white" />
          </div>

          {/* Pips */}
          {matches.slice(0, 6).map((match, idx) => {
            const { angle, r } = pipLayout[idx] || { angle: idx * 60, r: 60 };
            const rad = (angle * Math.PI) / 180;
            const x = Math.cos(rad) * r;
            const y = Math.sin(rad) * r;
            const status = connectionStatuses[match.id] || 'none';
            const isRevealed = status === 'accepted';
            const borderColor = status === 'accepted'
              ? 'border-[var(--color-success)]'
              : status === 'pending_sent' || status === 'pending_received'
              ? 'border-[var(--color-accent)]'
              : 'border-white/60';

            return (
              <button
                key={match.id}
                className="absolute top-1/2 left-1/2 z-20 cursor-pointer group"
                style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
                onClick={() => setSelectedMatch(match)}
                aria-label={isRevealed ? `Match: ${match.full_name}` : `Match: ${match.profession || 'Professional'}`}
              >
                <div className={`w-8 h-8 rounded-full overflow-hidden border-2 ${borderColor} shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-transform group-hover:scale-125`}>
                  {isRevealed ? (
                    match.avatar_url ? (
                      <img src={match.avatar_url} alt={match.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[var(--color-primary)] flex items-center justify-center text-white text-[10px] font-bold">
                        {match.full_name.charAt(0)}
                      </div>
                    )
                  ) : (
                    <div className="w-full h-full bg-[var(--color-sand)] flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="2" className="w-4 h-4">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                  )}
                </div>
                {/* Distance */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 whitespace-nowrap pointer-events-none">
                  <span className="text-[9px] font-semibold text-[var(--color-steel-light)]">{match.distance_m}m</span>
                </div>
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-8 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="bg-[var(--color-text-header)] text-white text-[10px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap shadow-lg">
                    {isRevealed ? match.full_name.split(' ')[0] : (match.profession || 'Professional')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Section header */}
        <div className="mb-4">
          <h3 className="font-serif text-xl text-[var(--color-text-header)] mb-1">Nearby Professionals</h3>
          <p className="text-[13px] text-[var(--color-text-secondary)]">{matches.length} match{matches.length !== 1 ? 'es' : ''} found</p>
        </div>

        {/* Match list */}
        {matches.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="w-14 h-14 bg-[var(--color-sand-light)] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)] mb-2">No matches yet</p>
            <p className="text-[13px] text-[var(--color-text-secondary)]/70">People with shared interests will appear here when nearby.</p>
          </div>
        ) : (
          <div className="space-y-3 pb-20">
            {matches.map((match, i) => {
              const status = connectionStatuses[match.id] || 'none';
              const isRevealed = status === 'accepted';

              return (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <button
                    onClick={() => { if (!isRevealed) setSelectedMatch(match); }}
                    className="card card-interactive w-full p-4 flex items-center gap-4 text-left"
                  >
                    {/* Avatar — blurred until connected */}
                    {isRevealed ? (
                      <div className="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden">
                        {match.avatar_url ? (
                          <img src={match.avatar_url} alt={match.full_name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-[var(--color-primary)] flex items-center justify-center text-white font-serif text-lg">
                            {match.full_name.charAt(0)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <BlurredAvatar size="md" />
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {isRevealed ? (
                        <>
                          <h4 className="font-serif text-base text-[var(--color-text-header)] mb-0.5">{match.full_name}</h4>
                          <p className="text-[13px] text-[var(--color-text-secondary)] truncate">{match.profession || 'Professional'}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-serif text-base text-[var(--color-text-header)] mb-1.5">{match.profession || 'Professional'}</p>
                          <div className="flex flex-wrap gap-1">
                            {match.overlap.slice(0, 3).map((interest) => (
                              <span key={interest} className="text-[10px] font-medium text-[var(--color-primary-dark)] bg-[var(--color-primary)]/8 px-2 py-0.5 rounded-full border border-[var(--color-primary)]/10">
                                {interest}
                              </span>
                            ))}
                            {match.overlap.length > 3 && (
                              <span className="text-[10px] text-[var(--color-text-secondary)] px-1 py-0.5">+{match.overlap.length - 3}</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Distance + action */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span className="text-[12px] font-semibold text-[var(--color-primary)]">{match.distance_m}m</span>
                      {isRevealed ? (
                        <Link
                          to={`/chat/${match.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="w-8 h-8 bg-[var(--color-primary)] text-white rounded-full flex items-center justify-center hover:bg-[var(--color-primary-dark)] transition-colors"
                          aria-label={`Message ${match.full_name}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        </Link>
                      ) : status === 'pending_sent' ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-2.5 py-1 rounded-full">Sent</span>
                      ) : status === 'pending_received' ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-error)] bg-[var(--color-error)]/8 px-2.5 py-1 rounded-full animate-gentle-pulse">Respond</span>
                      ) : (
                        <div className="w-8 h-8 border border-[var(--color-sand)] text-[var(--color-steel-light)] rounded-full flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                        </div>
                      )}
                    </div>
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Toasts */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 glass-effect border border-[var(--color-success)]/20 px-6 py-3 rounded-full shadow-lg z-[60]">
            <p className="text-sm font-semibold text-[var(--color-success)]">Connection request sent</p>
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 bg-[var(--color-error)]/5 border border-[var(--color-error)]/15 px-6 py-3 rounded-full shadow-lg z-[60]">
            <p className="text-sm font-semibold text-[var(--color-error)]">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connection Modal */}
      <AnimatePresence>
        {selectedMatch && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center"
            onClick={() => { setSelectedMatch(null); setInvitationMessage(''); }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="bg-[var(--color-bg-warm)] w-full max-w-md rounded-t-3xl sm:rounded-3xl p-8 shadow-xl border border-[var(--color-sand)]/50"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header — blurred identity */}
              <div className="flex items-center gap-4 mb-6">
                {connectionStatuses[selectedMatch.id] === 'accepted' ? (
                  <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
                    {selectedMatch.avatar_url ? (
                      <img src={selectedMatch.avatar_url} className="w-full h-full object-cover" alt={selectedMatch.full_name} />
                    ) : (
                      <div className="w-full h-full bg-[var(--color-primary)] flex items-center justify-center text-white text-2xl font-serif">
                        {selectedMatch.full_name.charAt(0)}
                      </div>
                    )}
                  </div>
                ) : (
                  <BlurredAvatar size="lg" />
                )}
                <div>
                  {connectionStatuses[selectedMatch.id] === 'accepted' ? (
                    <h3 className="font-serif text-xl text-[var(--color-text-header)]">{selectedMatch.full_name}</h3>
                  ) : (
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-steel-light)] mb-0.5">Identity revealed on connect</p>
                  )}
                  <p className="font-serif text-lg text-[var(--color-text-header)]">{selectedMatch.profession || 'Professional'}</p>
                  <p className="text-[12px] font-semibold text-[var(--color-primary)] mt-0.5">{selectedMatch.distance_m}m away</p>
                </div>
              </div>

              {/* Shared interests */}
              {selectedMatch.overlap.length > 0 && (
                <div className="mb-6">
                  <p className="section-label mb-2">{selectedMatch.overlap.length} shared interests</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMatch.overlap.map((interest) => (
                      <span key={interest} className="text-[12px] font-medium text-[var(--color-primary-dark)] bg-[var(--color-primary)]/8 px-3 py-1 rounded-full">
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Message */}
              <textarea
                className="input-field min-h-[90px] resize-none mb-6"
                placeholder="Introduce yourself..."
                value={invitationMessage}
                onChange={(e) => setInvitationMessage(e.target.value)}
                autoFocus
              />

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleSendRequest}
                  disabled={sendingTo === selectedMatch.id}
                  className="btn-primary w-full py-4 text-sm flex items-center justify-center gap-2"
                >
                  {sendingTo === selectedMatch.id ? (
                    <><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Sending...</>
                  ) : 'Request Connection'}
                </button>
                <button onClick={() => { setSelectedMatch(null); setInvitationMessage(''); }} className="w-full py-2.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
