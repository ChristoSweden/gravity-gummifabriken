import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { MOCK_USERS, getDemoProfile, getDemoConnections, acceptDemoConnection, declineDemoConnection } from '../services/mockData';
import { motion, AnimatePresence } from 'motion/react';

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
}

export default function ConnectionsPage() {
  const { user, isDemo } = useAuth();
  const [pendingRequests, setPendingRequests] = useState<(Connection & { profile: Profile })[]>([]);
  const [accepted, setAccepted] = useState<(Connection & { profile: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchConnections = React.useCallback(async () => {
    if (!user) return;

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

    const { data: connections } = await supabase
      .from('connections')
      .select('*')
      .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (!connections) { setLoading(false); return; }

    const otherIds = connections.map((c) =>
      c.requester_id === user.id ? c.recipient_id : c.requester_id
    );

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, interests, profession')
      .in('id', otherIds);

    const profileMap: Record<string, Profile> = {};
    (profiles || []).forEach((p: Profile) => { profileMap[p.id] = p; });

    const pending: (Connection & { profile: Profile })[] = [];
    const acc: (Connection & { profile: Profile })[] = [];

    connections.forEach((c) => {
      const otherId = c.requester_id === user.id ? c.recipient_id : c.requester_id;
      const profile = profileMap[otherId];
      if (!profile) return;
      if (c.status === 'pending' && c.recipient_id === user.id) pending.push({ ...c, profile });
      else if (c.status === 'accepted') acc.push({ ...c, profile });
    });

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

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [user, fetchConnections]);

  const handleAccept = async (connectionId: string) => {
    setUpdatingId(connectionId);
    if (isDemo) { acceptDemoConnection(connectionId); await fetchConnections(); setUpdatingId(null); return; }
    await supabase.from('connections').update({ status: 'accepted' }).eq('id', connectionId);
    await fetchConnections();
    setUpdatingId(null);
  };

  const handleDecline = async (connectionId: string) => {
    setUpdatingId(connectionId);
    if (isDemo) { declineDemoConnection(connectionId); await fetchConnections(); setUpdatingId(null); return; }
    await supabase.from('connections').delete().eq('id', connectionId);
    await fetchConnections();
    setUpdatingId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-warm)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="section-label">Loading connections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] pb-24">
      <div className="max-w-lg mx-auto px-6 pt-8">
        <header className="mb-8">
          <h2 className="font-serif text-3xl text-[var(--color-text-header)] mb-1">Connections</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">Your professional network</p>
        </header>

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
                {pendingRequests.map((req) => (
                  <motion.div layout key={req.id} className="card p-4">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-[var(--color-accent)] flex items-center justify-center text-white font-serif text-lg flex-shrink-0">
                        {req.profile.full_name?.charAt(0) || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-serif text-[var(--color-text-header)] truncate">{req.profile.full_name}</h4>
                        <p className="text-[13px] text-[var(--color-text-secondary)]">{req.profile.profession || 'Professional'}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAccept(req.id)} disabled={updatingId === req.id} className="btn-primary flex-1 py-2.5 text-xs disabled:opacity-50">
                        Accept
                      </button>
                      <button onClick={() => handleDecline(req.id)} disabled={updatingId === req.id} className="btn-secondary flex-1 py-2.5 text-xs disabled:opacity-50">
                        Decline
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}

          {/* Accepted */}
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
            {accepted.length > 0 && (
              <>
                <h3 className="section-label mb-4">Your Network ({accepted.length})</h3>
                <div className="space-y-2">
                  {accepted.map((conn) => (
                    <motion.div layout key={conn.id}>
                      <Link to={`/chat/${conn.profile.id}`} className="card card-interactive p-4 flex items-center gap-4 block">
                        <div className="w-11 h-11 rounded-xl bg-[var(--color-primary)] flex items-center justify-center text-white font-serif text-lg flex-shrink-0">
                          {conn.profile.full_name?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-serif text-[var(--color-text-header)] truncate">{conn.profile.full_name}</h4>
                          <p className="text-[13px] text-[var(--color-text-secondary)] truncate">
                            {(conn.profile.interests || []).slice(0, 2).join(' · ') || conn.profile.profession || 'Connected'}
                          </p>
                        </div>
                        <div className="w-9 h-9 rounded-full border border-[var(--color-sand)] flex items-center justify-center text-[var(--color-steel-light)] flex-shrink-0">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </>
            )}

            {accepted.length === 0 && pendingRequests.length === 0 && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card p-12 text-center">
                <div className="text-5xl mb-4">🤝</div>
                <h3 className="font-serif text-lg text-[var(--color-text-header)] mb-2">Your network starts here</h3>
                <p className="text-sm text-[var(--color-text-secondary)] mb-6 max-w-[260px] mx-auto">
                  Open the radar to discover professionals nearby who share your interests. One connection is all it takes.
                </p>
                <Link to="/radar" className="btn-primary inline-block px-8 py-3 text-xs">Open Radar</Link>
              </motion.div>
            )}
          </motion.section>
        </AnimatePresence>
      </div>
    </div>
  );
}
