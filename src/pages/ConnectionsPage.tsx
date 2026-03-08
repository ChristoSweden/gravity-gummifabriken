import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { MOCK_USERS, getDemoProfile, getDemoConnections, acceptDemoConnection, declineDemoConnection } from '../services/mockData';
import { motion, AnimatePresence } from 'motion/react';
import { haptic } from '../utils/haptics';

interface Connection {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: string;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string;
  interests: string[];
  profession?: string;
  avatar_url?: string;
  is_present?: boolean;
  last_seen_at?: string;
}

export default function ConnectionsPage() {
  const { user, isDemo } = useAuth();
  const [pendingRequests, setPendingRequests] = useState<(Connection & { profile: Profile; icebreaker?: string })[]>([]);
  const [accepted, setAccepted] = useState<(Connection & { profile: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [myInterests, setMyInterests] = useState<string[]>([]);
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  const fetchConnections = React.useCallback(async () => {
    if (!user) return;
    setFetchError(false);

    if (isDemo) {
      const connections = getDemoConnections();
      const profileMap: Record<string, Profile> = {};
      MOCK_USERS.forEach((p) => { profileMap[p.id] = p; });
      profileMap[getDemoProfile().id] = getDemoProfile();

      const pending: (Connection & { profile: Profile })[] = [];
      const acc: (Connection & { profile: Profile })[] = [];

      connections.forEach((c) => {
        const otherId = c.requester_id === getDemoProfile().id ? c.recipient_id : c.requester_id;
        const profile = profileMap[otherId];
        if (!profile) return;
        if (c.status === 'pending' && c.recipient_id === getDemoProfile().id) pending.push({ ...c, profile });
        else if (c.status === 'accepted') acc.push({ ...c, profile });
      });

      setPendingRequests(pending);
      setAccepted(acc);
      setLoading(false);
      return;
    }

    const { data: connections, error: connError } = await supabase
      .from('connections')
      .select('*')
      .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (connError || !connections) { setFetchError(true); setLoading(false); return; }

    const otherIds = connections.map((c) =>
      c.requester_id === user.id ? c.recipient_id : c.requester_id
    );

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, interests, profession, avatar_url, is_present, last_seen_at')
      .in('id', otherIds);

    const profileMap: Record<string, Profile> = {};
    (profiles || []).forEach((p: Profile) => { profileMap[p.id] = p; });

    // Fetch current user's interests for overlap calculation
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('interests')
      .eq('id', user.id)
      .single();
    const myInts = myProfile?.interests || [];
    setMyInterests(myInts);

    const pending: (Connection & { profile: Profile; icebreaker?: string })[] = [];
    const acc: (Connection & { profile: Profile })[] = [];

    connections.forEach((c) => {
      const otherId = c.requester_id === user.id ? c.recipient_id : c.requester_id;
      const profile = profileMap[otherId];
      if (!profile) return;
      if (c.status === 'pending' && c.recipient_id === user.id) pending.push({ ...c, profile });
      else if (c.status === 'accepted') acc.push({ ...c, profile });
    });

    // Fetch icebreaker messages for pending requests
    if (pending.length > 0) {
      const requesterIds = pending.map((p) => p.requester_id);
      const { data: msgs } = await supabase
        .from('messages')
        .select('sender_id, content')
        .eq('recipient_id', user.id)
        .in('sender_id', requesterIds)
        .order('created_at', { ascending: true });
      if (msgs) {
        const msgMap: Record<string, string> = {};
        msgs.forEach((m: { sender_id: string; content: string }) => {
          if (!msgMap[m.sender_id]) msgMap[m.sender_id] = m.content;
        });
        pending.forEach((p) => {
          if (msgMap[p.requester_id]) p.icebreaker = msgMap[p.requester_id];
        });
      }
    }

    setPendingRequests(pending);
    setAccepted(acc);
    setLoading(false);
  }, [user, isDemo]);

  useEffect(() => {
    fetchConnections();
    if (!user) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchConnections(), 500);
    };

    const channel = supabase
      .channel('connections-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `recipient_id=eq.${user.id}` }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `requester_id=eq.${user.id}` }, debouncedFetch)
      .subscribe();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') debouncedFetch();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, fetchConnections]);

  const handleAccept = async (connectionId: string, profileName: string) => {
    haptic('success');
    setUpdatingId(connectionId);
    if (isDemo) { acceptDemoConnection(connectionId); } else {
      await supabase.from('connections').update({ status: 'accepted' }).eq('id', connectionId);
    }
    setJustAccepted(connectionId);
    setTimeout(async () => {
      await fetchConnections();
      setUpdatingId(null);
      setTimeout(() => setJustAccepted(null), 2000);
    }, 600);
  };

  const handleDecline = async (connectionId: string) => {
    haptic('light');
    setUpdatingId(connectionId);
    if (isDemo) { declineDemoConnection(connectionId); await fetchConnections(); setUpdatingId(null); return; }
    await supabase.from('connections').delete().eq('id', connectionId);
    await fetchConnections();
    setUpdatingId(null);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-warm)] pb-24">
        <div className="max-w-lg mx-auto px-6 pt-8">
          <div className="mb-8">
            <div className="skeleton h-8 w-48 mb-2" />
            <div className="skeleton h-4 w-36" />
          </div>
          <div className="skeleton h-3 w-28 mb-4" />
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card p-4 flex items-center gap-4 mb-3" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="skeleton w-12 h-12 rounded-2xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-3 w-24" />
              </div>
              <div className="skeleton w-9 h-9 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-warm)] pb-24">
        <div className="max-w-lg mx-auto px-6 pt-8">
          <div className="card p-10 text-center mt-10">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[var(--color-error)]/8 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <h3 className="font-serif text-lg text-[var(--color-text-header)] mb-2">Couldn't load connections</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-5">Check your internet connection and try again.</p>
            <button onClick={() => fetchConnections()} className="btn-primary px-6 py-2.5 text-xs">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] pb-24">
      <div className="max-w-lg mx-auto px-6 pt-8">
        <header className="mb-6">
          <h2 className="font-serif text-3xl text-[var(--color-text-header)] mb-1">Connections</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {accepted.length > 0
              ? `${accepted.length} in your network`
              : 'Your professional network'
            }
          </p>
        </header>

        {/* Search */}
        {accepted.length > 3 && (
          <div className="relative mb-6">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name or profession..."
              className="input-field pl-10 py-2.5 text-sm"
              aria-label="Search connections"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-steel-light)] hover:text-[var(--color-text-primary)] transition-colors"
                aria-label="Clear search"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        )}

        {/* Just-accepted celebration toast */}
        <AnimatePresence>
          {justAccepted && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="mb-6 bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-2xl px-4 py-3 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--color-success)]/15 flex items-center justify-center flex-shrink-0 animate-success-check">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <p className="text-sm font-medium text-[var(--color-success)]">Connection accepted! You can now message each other.</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {/* Pending */}
          {pendingRequests.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-10"
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-gentle-pulse" />
                <h3 className="section-label">Pending Requests ({pendingRequests.length})</h3>
              </div>
              <div className="space-y-3">
                {pendingRequests.map((req, i) => {
                  const isExpanded = expandedRequest === req.id;
                  const overlap = myInterests.filter((int) =>
                    (req.profile.interests || []).some((j) => j.toLowerCase() === int.toLowerCase())
                  );
                  const isAccepting = justAccepted === req.id;
                  return (
                    <motion.div
                      layout
                      key={req.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={isAccepting
                        ? { opacity: 0, scale: 0.95, transition: { duration: 0.3 } }
                        : { opacity: 1, y: 0, transition: { delay: i * 0.05 } }
                      }
                      exit={{ opacity: 0, x: -40, transition: { duration: 0.2 } }}
                      className="card overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedRequest(isExpanded ? null : req.id)}
                        className="w-full p-4 flex items-center gap-4 text-left"
                      >
                        <div className="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0 ring-2 ring-[var(--color-accent)]/20">
                          {req.profile.avatar_url ? (
                            <img src={req.profile.avatar_url} alt={req.profile.full_name} loading="lazy" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-[var(--color-accent)] flex items-center justify-center text-white font-serif text-lg">
                              {req.profile.full_name?.charAt(0) || '?'}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-serif text-[var(--color-text-header)] truncate">{req.profile.full_name}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[13px] text-[var(--color-text-secondary)] truncate">{req.profile.profession || 'Professional'}</p>
                            <span className="text-[10px] text-[var(--color-steel-light)]">{timeAgo(req.created_at)}</span>
                          </div>
                          {overlap.length > 0 && !isExpanded && (
                            <p className="text-[11px] text-[var(--color-primary)] mt-1 font-medium">
                              {overlap.length} shared interest{overlap.length !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                        <svg
                          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          className={`flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 space-y-3">
                              {/* Icebreaker message */}
                              {req.icebreaker && (
                                <div className="bg-[var(--color-mist)] rounded-xl px-3.5 py-2.5">
                                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-1">Their message</p>
                                  <p className="text-[13px] text-[var(--color-text-primary)] italic leading-relaxed">"{req.icebreaker}"</p>
                                </div>
                              )}

                              {/* Shared interests */}
                              {overlap.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-1.5">
                                    {overlap.length} shared interest{overlap.length !== 1 ? 's' : ''}
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {overlap.map((interest) => (
                                      <span key={interest} className="text-[11px] font-medium text-[var(--color-primary-dark)] bg-[var(--color-primary)]/8 px-2.5 py-1 rounded-full border border-[var(--color-primary)]/10">
                                        {interest}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* All their interests */}
                              {(req.profile.interests || []).length > 0 && (
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-1.5">Their interests</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {req.profile.interests.map((interest) => (
                                      <span
                                        key={interest}
                                        className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${
                                          overlap.some((o) => o.toLowerCase() === interest.toLowerCase())
                                            ? 'text-[var(--color-primary-dark)] bg-[var(--color-primary)]/8 border border-[var(--color-primary)]/10'
                                            : 'text-[var(--color-text-secondary)] bg-[var(--color-sand)]/60'
                                        }`}
                                      >
                                        {interest}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Accept / Decline */}
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => handleAccept(req.id, req.profile.full_name)} disabled={updatingId === req.id} className="btn-primary flex-1 py-2.5 text-xs disabled:opacity-50">
                                  {updatingId === req.id ? (
                                    <span className="flex items-center justify-center gap-2">
                                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      Accepting...
                                    </span>
                                  ) : 'Accept'}
                                </button>
                                <button onClick={() => handleDecline(req.id)} disabled={updatingId === req.id} className="btn-secondary flex-1 py-2.5 text-xs disabled:opacity-50">
                                  Decline
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Compact accept/decline when collapsed */}
                      {!isExpanded && (
                        <div className="flex gap-2 px-4 pb-4">
                          <button onClick={(e) => { e.stopPropagation(); handleAccept(req.id, req.profile.full_name); }} disabled={updatingId === req.id} className="btn-primary flex-1 py-2.5 text-xs disabled:opacity-50">
                            {updatingId === req.id ? (
                              <span className="flex items-center justify-center gap-2">
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              </span>
                            ) : 'Accept'}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDecline(req.id); }} disabled={updatingId === req.id} className="btn-secondary flex-1 py-2.5 text-xs disabled:opacity-50">
                            Decline
                          </button>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.section>
          )}

          {/* Accepted */}
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
            {accepted.length > 0 && (() => {
              const q = searchQuery.toLowerCase().trim();
              const filtered = q
                ? accepted.filter(c => c.profile.full_name?.toLowerCase().includes(q) || c.profile.profession?.toLowerCase().includes(q))
                : accepted;
              return (
              <>
                <h3 className="section-label mb-4">Your Network ({filtered.length}{q ? ` of ${accepted.length}` : ''})</h3>
                {filtered.length === 0 && q ? (
                  <div className="card p-8 text-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-60">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <p className="text-sm text-[var(--color-text-secondary)]">No connections matching "{searchQuery}"</p>
                  </div>
                ) : (
                <div className="space-y-2">
                  {filtered.map((conn, i) => (
                    <motion.div
                      layout
                      key={conn.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <Link to={`/chat/${conn.profile.id}`} className="card card-interactive p-4 flex items-center gap-4 block">
                        <div className="relative w-12 h-12 flex-shrink-0">
                          <div className="w-12 h-12 rounded-2xl overflow-hidden">
                            {conn.profile.avatar_url ? (
                              <img src={conn.profile.avatar_url} alt={conn.profile.full_name} loading="lazy" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-[var(--color-primary)] flex items-center justify-center text-white font-serif text-lg">
                                {conn.profile.full_name?.charAt(0) || '?'}
                              </div>
                            )}
                          </div>
                          {conn.profile.is_present && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[var(--color-success)] rounded-full border-2 border-[var(--color-bg-warm)]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-serif text-[var(--color-text-header)] truncate">{conn.profile.full_name}</h4>
                          <p className="text-[13px] text-[var(--color-text-secondary)] truncate">
                            {conn.profile.profession || (conn.profile.interests || []).slice(0, 2).join(' · ') || 'Connected'}
                          </p>
                        </div>
                        <div className="w-9 h-9 rounded-full border border-[var(--color-sand)] flex items-center justify-center text-[var(--color-steel-light)] flex-shrink-0 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
                )}
              </>
              );
            })()}

            {/* Empty state — no connections at all */}
            {accepted.length === 0 && pendingRequests.length === 0 && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-[var(--color-primary)]/8 flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <h3 className="font-serif text-xl text-[var(--color-text-header)] mb-2">Your network starts here</h3>
                <p className="text-sm text-[var(--color-text-secondary)] mb-6 max-w-[280px] mx-auto leading-relaxed">
                  Open the radar to discover professionals nearby who share your interests. One connection is all it takes.
                </p>
                <Link to="/radar" className="btn-primary inline-block px-8 py-3 text-xs">Open Radar</Link>
              </motion.div>
            )}

            {/* Empty state — has pending but no accepted yet */}
            {accepted.length === 0 && pendingRequests.length > 0 && (
              <div className="card p-8 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--color-mist)] flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  </svg>
                </div>
                <h3 className="font-serif text-base text-[var(--color-text-header)] mb-1">No connections yet</h3>
                <p className="text-[13px] text-[var(--color-text-secondary)] max-w-[240px] mx-auto">
                  Accept a request above or discover new people on the radar.
                </p>
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      </div>
    </div>
  );
}
