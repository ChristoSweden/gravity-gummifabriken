import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoUrl from '../assets/logo.png';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { MOCK_USERS, getDemoProfile, getDemoConnections, isConnectedInDemo, addDemoConnection, addDemoMessage, acceptDemoConnection, declineDemoConnection } from '../services/mockData';
import { getInterestOverlap } from '../utils/matching';
import { track } from '@vercel/analytics';
import { APP_CONFIG } from '../config/appConfig';
import { motion, AnimatePresence } from 'motion/react';

/** Haversine distance between two GPS coordinates, in metres. */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Stable pseudo-random distance (10–180m) based on two user IDs.
 *  Since GPS coords aren't stored, this gives each pair a consistent
 *  "nearby" feel without revealing real positions. */
function stableDistance(idA: string, idB: string): number {
  const pair = [idA, idB].sort().join(':');
  let hash = 0;
  for (let i = 0; i < pair.length; i++) {
    hash = ((hash << 5) - hash + pair.charCodeAt(i)) | 0;
  }
  return 10 + Math.abs(hash % 171); // 10–180m
}

type PresenceStatus = 'checking' | 'present' | 'absent' | 'manual' | 'gps_denied' | 'gps_unavailable';

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
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [connectionStatuses, setConnectionStatuses] = useState<ConnectionStatus>({});
  const [loading, setLoading] = useState(true);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<MatchProfile | null>(null);
  const [invitationMessage, setInvitationMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingReviewRequest, setPendingReviewRequest] = useState<(Profile & { connectionId: string; message?: string }) | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>('checking');
  const presenceChecked = useRef(false);
  const pendingDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delayed reveal: stages a pending request and shows it after 10s
  const stagePendingRequest = React.useCallback((req: (Profile & { connectionId: string; message?: string }) | null) => {
    if (pendingDelayTimer.current) clearTimeout(pendingDelayTimer.current);
    if (!req) {
      setPendingReviewRequest(null);
      return;
    }
    pendingDelayTimer.current = setTimeout(() => {
      setPendingReviewRequest(req);
    }, 10000);
  }, []);
  const [activityFeed, setActivityFeed] = useState<{ id: string; text: string; time: string; type: 'join' | 'connect' }[]>([]);

  /** Plan A: GPS geofence check. Updates is_present in DB, returns true if at venue. */
  const checkGpsPresence = React.useCallback(async (): Promise<boolean> => {
    if (!user || isDemo) return true; // demo users are always "present"
    if (!navigator.geolocation) {
      setPresenceStatus('gps_unavailable');
      return false;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const dist = haversineDistance(
            pos.coords.latitude, pos.coords.longitude,
            APP_CONFIG.VENUE_LAT, APP_CONFIG.VENUE_LNG
          );
          const atVenue = dist <= APP_CONFIG.PRESENCE_RADIUS_M;
          setPresenceStatus(atVenue ? 'present' : 'absent');
          // Update own presence regardless — clears stale check-ins for those who left
          await supabase.from('profiles').update({
            is_present: atVenue,
            last_seen_at: atVenue ? new Date().toISOString() : null,
          }).eq('id', user.id);
          resolve(atVenue);
        },
        (err) => {
          // PERMISSION_DENIED = 1
          setPresenceStatus(err.code === 1 ? 'gps_denied' : 'gps_unavailable');
          resolve(false);
        },
        { timeout: 8000, maximumAge: 60000 }
      );
    });
  }, [user, isDemo]);

  /** Plan B: manual check-in — user taps "I'm here" button. */
  const handleManualCheckIn = async () => {
    if (!user) return;
    setPresenceStatus('manual');
    await supabase.from('profiles').update({
      is_present: true,
      last_seen_at: new Date().toISOString(),
    }).eq('id', user.id);
    fetchData();
  };

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

      // Check for pending received requests in demo mode (delayed reveal)
      const pendingReceivedEntry = Object.entries(statuses).find(([, s]) => s === 'pending_received');
      if (pendingReceivedEntry) {
        const [pendingUserId] = pendingReceivedEntry;
        const requesterProfile = MOCK_USERS.find(u => u.id === pendingUserId);
        const demoConns = getDemoConnections();
        const demoConn = demoConns.find(c => c.requester_id === pendingUserId && c.recipient_id === me.id);
        if (requesterProfile && demoConn) {
          stagePendingRequest({ ...requesterProfile, connectionId: demoConn.id });
        }
      } else {
        stagePendingRequest(null);
      }

      setLoading(false);
      return;
    }

    // Only fetch users who are currently present at the venue.
    // Staleness cutoff: last_seen_at within the last 4 hours.
    const stalenessCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('id, full_name, interests, profession, company, avatar_url, is_incognito, is_present, last_seen_at')
      .or(`id.eq.${user.id},and(is_present.eq.true,last_seen_at.gte.${stalenessCutoff})`);

    if (pError || !profiles) {
      setError('Unable to load nearby profiles. Please try again.');
      setLoading(false);
      return;
    }

    // Fetch blocked users to exclude them
    const { data: blocks } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', user.id);
    const blockedIds = new Set((blocks || []).map(b => b.blocked_id));

    const me = profiles.find((p) => p.id === user.id);
    const others = profiles.filter((p) => p.id !== user.id && !p.is_incognito && p.is_present && !blockedIds.has(p.id));
    setUserProfile(me || null);

    if (me?.interests) {
      const withOverlap: MatchProfile[] = others
        .map((p) => ({
          ...p,
          overlap: getInterestOverlap(me as Profile, p as Profile),
          // Stable pseudo-random distance based on user ID pair (privacy-safe: no real coords stored)
          distance_m: stableDistance(user.id, p.id),
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

    // If there are pending received requests, find the first one to show prominently
    const firstPending = (connections || []).find(c => c.status === 'pending' && c.recipient_id === (isDemo ? getDemoProfile().id : user.id));
    if (firstPending) {
      const otherId = firstPending.requester_id === (isDemo ? getDemoProfile().id : user.id) ? firstPending.recipient_id : firstPending.requester_id;
      const { data: profile } = await supabase.from('profiles').select('id, full_name, interests, profession, company, avatar_url').eq('id', otherId).single();

      // Also check for the most recent message from them (icebreaker)
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('content')
        .eq('sender_id', otherId)
        .eq('recipient_id', (isDemo ? getDemoProfile().id : user.id))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (profile) {
        stagePendingRequest({
          ...profile,
          connectionId: firstPending.id,
          message: lastMsg?.content
        });
      }
    } else {
      stagePendingRequest(null);
    }

    // Activity feed: recent check-ins and connections (last 2 hours)
    // Uses RPC function to bypass RLS and show venue-wide activity
    if (!isDemo) {
      const { data: feedData } = await supabase.rpc('get_activity_feed');
      if (feedData) {
        const raw = feedData as {
          recent_presence: { full_name: string; last_seen_at: string }[];
          recent_connections: { created_at: string }[];
        };
        const feed: typeof activityFeed = [];
        (raw.recent_presence || []).forEach((p) => {
          const mins = Math.floor((Date.now() - new Date(p.last_seen_at).getTime()) / 60000);
          feed.push({
            id: `join-${p.full_name}-${p.last_seen_at}`,
            text: `${p.full_name?.split(' ')[0] || 'Someone'} checked in`,
            time: mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`,
            type: 'join',
          });
        });
        (raw.recent_connections || []).forEach((c) => {
          const mins = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 60000);
          feed.push({
            id: `conn-${c.created_at}`,
            text: 'New connection made',
            time: mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`,
            type: 'connect',
          });
        });
        feed.sort((a, b) => {
          const aMs = a.time === 'just now' ? 0 : parseInt(a.time);
          const bMs = b.time === 'just now' ? 0 : parseInt(b.time);
          return aMs - bMs;
        });
        setActivityFeed(feed.slice(0, 5));
      }
    }

    setLoading(false);
  }, [user, isDemo, stagePendingRequest]);

  // Clean up delay timer on unmount
  useEffect(() => {
    return () => {
      if (pendingDelayTimer.current) clearTimeout(pendingDelayTimer.current);
    };
  }, []);

  useEffect(() => {
    // Run GPS presence check once on mount, then fetch data.
    // presenceChecked ref prevents re-running on every re-render.
    if (!presenceChecked.current) {
      presenceChecked.current = true;
      checkGpsPresence().then(() => fetchData());
    } else {
      fetchData();
    }

    // Debounce realtime refetches: with 100 users, rapid profile/connection
    // changes would otherwise trigger a flood of simultaneous DB queries.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchData(), 800);
    };

    const channel = supabase
      .channel('radar-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, debouncedFetch)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchData, checkGpsPresence]);

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
      return;
    }

    if (!user) return;

    const { error: connError } = await supabase.from('connections').insert({
      requester_id: user.id,
      recipient_id: recipientId,
    });

    if (connError) {
      let msg = 'Failed to send request. Please try again.';
      if (connError.message.includes('duplicate') || connError.message.includes('reverse')) {
        msg = 'Connection already exists.';
      } else if (connError.message.includes('rate') || connError.message.includes('limit') || connError.message.includes('too many')) {
        msg = 'Slow down — too many requests. Try again in a few minutes.';
      }
      setError(msg);
      setSendingTo(null);
      setSelectedMatch(null);
      setInvitationMessage('');
      return;
    }

    if (invitationMessage.trim()) {
      const { error: msgErr } = await supabase.from('messages').insert({
        sender_id: user.id,
        recipient_id: recipientId,
        content: invitationMessage.trim(),
      });
      if (msgErr) {
        console.warn('Icebreaker message failed:', msgErr.message);
        // Connection was created — proceed but note the message didn't send
      }
    }

    setConnectionStatuses((prev) => ({ ...prev, [recipientId]: 'pending_sent' }));
    setShowSuccess(true);
    track('connection_request_sent', { mode: 'live', target_id: recipientId });
    setSendingTo(null);
    setSelectedMatch(null);
    setInvitationMessage('');
  };

  const handleAcceptConnection = async (connectionId: string) => {
    setUpdatingId(connectionId);
    const requesterId = pendingReviewRequest?.id;
    if (isDemo) {
      acceptDemoConnection(connectionId);
      setPendingReviewRequest(null);
      setUpdatingId(null);
      if (requesterId) navigate(`/chat/${requesterId}`);
      return;
    }
    const { error: acceptErr } = await supabase.from('connections').update({ status: 'accepted' }).eq('id', connectionId);
    if (acceptErr) {
      setError('Failed to accept connection. Please try again.');
      setUpdatingId(null);
      return;
    }
    setPendingReviewRequest(null);
    setUpdatingId(null);
    if (requesterId) navigate(`/chat/${requesterId}`);
  };

  const handleDeclineConnection = async (connectionId: string) => {
    setUpdatingId(connectionId);
    if (isDemo) {
      declineDemoConnection(connectionId);
      setPendingReviewRequest(null);
      setUpdatingId(null);
      await fetchData();
      return;
    }
    const { error: declineErr } = await supabase.from('connections').delete().eq('id', connectionId);
    if (declineErr) {
      setError('Failed to decline. Please try again.');
      setUpdatingId(null);
      return;
    }
    setPendingReviewRequest(null);
    setUpdatingId(null);
    await fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D0B09] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-[#B87333] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7572]">Scanning nearby...</p>
        </div>
      </div>
    );
  }

  const pendingReceivedCount = Object.values(connectionStatuses).filter(s => s === 'pending_received').length;

  const pipLayout = [
    { angle: 30, r: 42 },
    { angle: 100, r: 68 },
    { angle: 170, r: 90 },
    { angle: 220, r: 56 },
    { angle: 290, r: 80 },
    { angle: 350, r: 105 },
  ];

  return (
    <div className="min-h-screen bg-[#0D0B09] pb-28">
      <div className="max-w-lg mx-auto px-6 pt-6">

        {/* ── Plan B: Manual check-in banner (GPS denied / outside venue) ── */}
        <AnimatePresence>
          {(presenceStatus === 'gps_denied' || presenceStatus === 'gps_unavailable') && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4"
            >
              <div className="bg-[#D4AF37]/8 border border-[#D4AF37]/20 rounded-2xl px-4 py-3.5 flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                <p className="text-[13px] text-[#A09890] flex-1">
                  {presenceStatus === 'gps_denied' ? 'Location access denied.' : 'GPS unavailable.'}{' '}
                  Confirm you're at {APP_CONFIG.LOCATION_NAME}.
                </p>
                <button
                  onClick={handleManualCheckIn}
                  className="flex-shrink-0 text-[12px] font-bold text-white bg-[#B87333] px-3 py-1.5 rounded-full hover:bg-[#8B5A2B] transition-colors"
                >
                  I'm here
                </button>
              </div>
            </motion.div>
          )}
          {presenceStatus === 'absent' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4"
            >
              <div className="bg-[#1A1714] border border-[#2A2522] rounded-2xl px-4 py-3.5 flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7A7572" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                <p className="text-[13px] text-[#A09890] flex-1">
                  You're not at {APP_CONFIG.LOCATION_NAME} right now. Radar shows who's present.
                </p>
                <button
                  onClick={handleManualCheckIn}
                  className="flex-shrink-0 text-[12px] font-bold text-[#D4956A] px-3 py-1.5 rounded-full border border-[#B87333]/30 hover:bg-[#B87333]/10 transition-colors"
                >
                  Check in
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
                <div className="bg-[#D4AF37]/8 border border-[#D4AF37]/25 rounded-2xl px-4 py-3.5 flex items-center gap-3">
                  <span className="w-2.5 h-2.5 bg-[#D4AF37] rounded-full animate-gentle-pulse flex-shrink-0" />
                  <p className="text-sm font-semibold text-[#E8E0D4] flex-1">
                    {pendingReceivedCount} connection request{pendingReceivedCount !== 1 ? 's' : ''} waiting
                  </p>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A7572" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </div>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status badge row */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-[13px] text-[#7A7572]">
            {APP_CONFIG.RADAR_RADIUS} radius
          </p>
          {presenceStatus === 'present' || presenceStatus === 'manual' || isDemo ? (
            <div className="flex items-center gap-1.5 bg-transparent border border-[#D4AF37]/40 px-3.5 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-[#D4AF37] rounded-full animate-gentle-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#D4AF37]">Scanning</span>
            </div>
          ) : presenceStatus === 'checking' ? (
            <div className="flex items-center gap-1.5 bg-transparent border border-[#4A4543] px-3.5 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-[#7A7572] rounded-full animate-gentle-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#7A7572]">Locating...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-transparent border border-[#4A4543] px-3.5 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-[#4A4543] rounded-full" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#7A7572]">Offline</span>
            </div>
          )}
        </div>

        {/* Radar Visual */}
        <div className="relative w-80 h-80 mx-auto mb-12">
          {/* Ambient copper glow behind radar */}
          <div
            className="absolute -inset-8 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(184,115,51,0.12) 0%, rgba(139,90,43,0.04) 50%, transparent 70%)' }}
          />

          <div
            className="absolute inset-0 rounded-full border border-[#B87333]/30"
            style={{ background: 'radial-gradient(circle, rgba(184,115,51,0.08) 0%, rgba(13,11,9,0.9) 60%, #0D0B09 100%)' }}
          >
            {/* Concentric rings */}
            {[0.78, 0.56, 0.34].map((scale, i) => (
              <div key={i} className="absolute inset-0 border border-[#B87333]/15 rounded-full" style={{ transform: `scale(${scale})` }} />
            ))}
            {/* Cross-hair grid lines */}
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-px bg-[#B87333]/10" />
            <div className="absolute left-0 right-0 top-1/2 -translate-y-px h-px bg-[#B87333]/10" />
            {/* Diagonal grid lines */}
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div className="absolute top-1/2 left-1/2 w-[141%] h-px bg-[#B87333]/8 origin-left" style={{ transform: 'translate(-50%, -50%) rotate(45deg)' }} />
              <div className="absolute top-1/2 left-1/2 w-[141%] h-px bg-[#B87333]/8 origin-left" style={{ transform: 'translate(-50%, -50%) rotate(-45deg)' }} />
            </div>
            {/* Rotating sweep beam */}
            <div className="absolute inset-0 rounded-full animate-scan origin-center pointer-events-none z-10">
              <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, rgba(212,175,55,0.28) 0deg, rgba(184,115,51,0.12) 20deg, transparent 55deg)' }} />
              <div className="absolute top-0 left-1/2 -translate-x-px w-0.5 h-1/2 origin-bottom" style={{ background: 'linear-gradient(to top, rgba(212,175,55,0.6), transparent)' }} />
            </div>
            {/* Pulse ring */}
            <div className="absolute inset-0 rounded-full border border-[#B87333]/25 animate-radar-pulse" />
          </div>

          {/* Center logo */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
            <div className="relative">
              <div className="absolute -inset-3 rounded-full blur-xl bg-[#B87333]/30" />
              <img src={logoUrl} alt="Gravity" className="relative w-12 h-12 rounded-full object-cover shadow-[0_0_24px_rgba(184,115,51,0.5)] border-2 border-[#B87333]/60" />
            </div>
          </div>

          {/* Pips */}
          {matches.slice(0, 6).map((match, idx) => {
            const { angle, r } = pipLayout[idx] || { angle: idx * 60, r: 60 };
            const rad = (angle * Math.PI) / 180;
            const scaledR = r * 1.1;
            const x = Math.cos(rad) * scaledR;
            const y = Math.sin(rad) * scaledR;
            const status = connectionStatuses[match.id] || 'none';
            const isRevealed = status === 'accepted';
            const borderColor = status === 'accepted'
              ? 'border-[#3D8B5F]'
              : status === 'pending_sent' || status === 'pending_received'
                ? 'border-[#D4AF37]'
                : 'border-[#B87333]/50';

            return (
              <button
                key={match.id}
                className="absolute top-1/2 left-1/2 z-20 cursor-pointer group"
                style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
                onClick={() => setSelectedMatch(match)}
                aria-label={isRevealed ? `Match: ${match.full_name}` : `Match: ${match.profession || 'Professional'}`}
              >
                <div className={`w-9 h-9 rounded-full overflow-hidden border-2 ${borderColor} shadow-[0_0_12px_rgba(184,115,51,0.3)] transition-transform group-hover:scale-125`}>
                  {isRevealed ? (
                    match.avatar_url ? (
                      <img src={match.avatar_url} alt={match.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#B87333] flex items-center justify-center text-white text-xs font-serif font-bold">
                        {match.full_name.charAt(0)}
                      </div>
                    )
                  ) : (
                    <div className="w-full h-full bg-[#1A1714] flex items-center justify-center">
                      <span className="text-[11px] font-serif font-bold text-[#D4AF37]/70">G</span>
                    </div>
                  )}
                </div>
                {/* Distance */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 whitespace-nowrap pointer-events-none">
                  <span className="text-[9px] font-semibold text-[#7A7572]">{match.distance_m}m</span>
                </div>
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-8 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="bg-[#1A1714] text-[#E8E0D4] text-[10px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap shadow-lg border border-[#B87333]/20">
                    {isRevealed ? match.full_name.split(' ')[0] : (match.profession || 'Professional')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Activity Feed */}
        {activityFeed.length > 0 && (
          <div className="mb-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7572] mb-3">Live Activity</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {activityFeed.map((item) => (
                <div key={item.id} className="flex-shrink-0 bg-[#1A1714]/80 backdrop-blur-sm border border-[#2A2522] rounded-full px-3 py-1.5 flex items-center gap-2">
                  {item.type === 'join' ? (
                    <span className="w-1.5 h-1.5 bg-[#3D8B5F] rounded-full" />
                  ) : (
                    <span className="w-1.5 h-1.5 bg-[#D4AF37] rounded-full" />
                  )}
                  <span className="text-[11px] text-[#E8E0D4] font-medium whitespace-nowrap">{item.text}</span>
                  <span className="text-[10px] text-[#7A7572] whitespace-nowrap">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7572]">Nearby Professionals</h3>
          <span className="text-[12px] font-semibold text-[#D4956A]">{matches.length} Active</span>
        </div>

        {/* Match list */}
        {matches.length === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#1A1714] border border-[#2A2522] rounded-[2rem] p-12 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#B87333]/10 flex items-center justify-center text-[#B87333]">
              {presenceStatus === 'present' || presenceStatus === 'manual' || isDemo ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/></svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              )}
            </div>
            <h3 className="font-serif text-lg text-[#E8E0D4] mb-2">
              {presenceStatus === 'present' || presenceStatus === 'manual' || isDemo
                ? 'Scanning the airwaves...'
                : 'The radar awaits'}
            </h3>
            <p className="text-sm text-[#7A7572] max-w-[260px] mx-auto">
              {presenceStatus === 'present' || presenceStatus === 'manual' || isDemo
                ? "No one with shared interests is nearby right now. They'll appear the moment they arrive."
                : `Head to ${APP_CONFIG.LOCATION_NAME} and your radar will light up with like-minded professionals.`}
            </p>
          </motion.div>
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
                    className="w-full p-4 flex items-center gap-4 text-left bg-[#1A1714] border border-[#2A2522] rounded-2xl transition-all hover:border-[#B87333]/30 hover:shadow-[0_4px_20px_rgba(184,115,51,0.08)]"
                  >
                    {/* Avatar — blurred until connected */}
                    {isRevealed ? (
                      <div className="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden">
                        {match.avatar_url ? (
                          <img src={match.avatar_url} alt={match.full_name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-[#B87333] flex items-center justify-center text-white font-serif text-lg">
                            {match.full_name.charAt(0)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#2A2522] flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-serif font-bold text-[#D4AF37]/60">G</span>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {isRevealed ? (
                        <>
                          <h4 className="font-serif text-base text-[#E8E0D4] mb-0.5">{match.full_name}</h4>
                          <p className="text-[13px] text-[#7A7572] truncate">{match.profession || 'Professional'}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-serif text-base text-[#E8E0D4] mb-1.5">{match.profession || 'Professional'}</p>
                          <div className="flex flex-wrap gap-1">
                            {match.overlap.slice(0, 3).map((interest) => (
                              <span key={interest} className="text-[10px] font-medium text-[#D4956A] bg-[#B87333]/10 px-2 py-0.5 rounded-full border border-[#B87333]/15">
                                {interest}
                              </span>
                            ))}
                            {match.overlap.length > 3 && (
                              <span className="text-[10px] text-[#7A7572] px-1 py-0.5">+{match.overlap.length - 3}</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Distance + match % + action */}
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-[#D4956A]">{match.distance_m}m</span>
                        <span className="text-[11px] font-bold text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded-full">
                          {userProfile?.interests ? Math.round((match.overlap.length / userProfile.interests.length) * 100) : 0}%
                        </span>
                      </div>
                      {isRevealed ? (
                        <Link
                          to={`/chat/${match.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="w-8 h-8 bg-[#B87333] text-white rounded-full flex items-center justify-center hover:bg-[#8B5A2B] transition-colors"
                          aria-label={`Message ${match.full_name}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        </Link>
                      ) : status === 'pending_sent' ? (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4956A]">Awaiting Reply</span>
                      ) : status === 'pending_received' ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#C24B3B] bg-[#C24B3B]/10 px-2.5 py-1 rounded-full animate-gentle-pulse">Respond</span>
                      ) : (
                        <div className="w-8 h-8 border border-[#2A2522] text-[#7A7572] rounded-full flex items-center justify-center">
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

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 bg-[#C24B3B]/10 border border-[#C24B3B]/20 px-6 py-3 rounded-full shadow-lg z-[110]">
            <p className="text-sm font-semibold text-[#C24B3B]">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success modal */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-end sm:items-center justify-center"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="bg-[var(--color-bg-warm)] w-full max-w-md rounded-t-3xl sm:rounded-3xl p-8 shadow-xl border border-[var(--color-sand)]/50 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-[var(--color-success)]/12 flex items-center justify-center mx-auto mb-5">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <h3 className="font-serif text-xl text-[var(--color-text-header)] mb-2">Connection Request Sent</h3>
              <p className="text-sm text-[var(--color-text-secondary)] mb-8">We'll notify you once they accept.</p>
              <button
                onClick={() => setShowSuccess(false)}
                className="w-full py-3.5 rounded-2xl bg-[var(--color-sand-light)] text-[var(--color-text-secondary)] text-sm font-semibold hover:bg-[var(--color-sand)] transition-colors"
              >
                Close
              </button>
            </motion.div>
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

      {/* Premium Request Modal (Prominent Popup) */}
      <AnimatePresence>
        {pendingReviewRequest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[200] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[var(--color-bg-warm)] w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-white/20 overflow-hidden relative"
            >
              {/* Profile Header */}
              <div className="bg-[var(--color-primary)]/10 pt-12 pb-8 px-8 text-center border-b border-[var(--color-sand)]/50">
                <div className="relative inline-block mb-6">
                  <div className="absolute inset-0 bg-[var(--color-primary)] rounded-full blur-2xl opacity-20 animate-pulse" />
                  <BlurredAvatar size="lg" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[var(--color-accent)] rounded-full border-2 border-white flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                  </div>
                </div>

                <h3 className="font-serif text-2xl text-[var(--color-text-header)] mb-1">Premium Request</h3>
                <p className="text-[11px] font-bold text-[var(--color-primary)] uppercase tracking-[0.2em]">New Connection Detected</p>
              </div>

              {/* Request Details */}
              <div className="p-8 space-y-6">
                <div className="text-center">
                  <p className="font-serif text-lg text-[var(--color-text-header)] mb-0.5">
                    {pendingReviewRequest.profession || 'Professional'}
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">Shared Interests Found</p>
                </div>

                {/* Shared interests display (if interests exist) */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {(pendingReviewRequest.interests || []).slice(0, 3).map((interest) => (
                    <span key={interest} className="text-[10px] font-semibold text-[var(--color-primary-dark)] bg-[var(--color-primary)]/8 px-3 py-1 rounded-full border border-[var(--color-primary)]/10">
                      {interest}
                    </span>
                  ))}
                </div>

                {/* Message display */}
                {pendingReviewRequest.message && (
                  <div className="bg-[var(--color-bg-card)]/80 backdrop-blur-md rounded-2xl p-5 border border-[var(--color-sand)]/60 italic">
                    <p className="text-[13px] text-[var(--color-text-primary)] leading-relaxed">
                      "{pendingReviewRequest.message}"
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-3 pt-2">
                  <button
                    onClick={() => handleAcceptConnection(pendingReviewRequest.connectionId)}
                    disabled={updatingId === pendingReviewRequest.connectionId}
                    className="btn-primary w-full py-5 text-sm shadow-premium flex items-center justify-center gap-2"
                  >
                    {updatingId === pendingReviewRequest.connectionId ? 'Processing...' : 'Accept Connection'}
                  </button>
                  <button
                    onClick={() => handleDeclineConnection(pendingReviewRequest.connectionId)}
                    disabled={updatingId === pendingReviewRequest.connectionId}
                    className="w-full py-3 text-[11px] font-bold text-[var(--color-steel-light)] uppercase tracking-[0.2em] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    Ignore for now
                  </button>
                </div>
              </div>

              {/* Decorative accent */}
              <div className="h-1 bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent opacity-20" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
