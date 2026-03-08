import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import logoUrl from '../assets/logo.png';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { MOCK_USERS, getDemoProfile, getDemoConnections, isConnectedInDemo, addDemoConnection, addDemoMessage, acceptDemoConnection, declineDemoConnection } from '../services/mockData';
import { getInterestOverlap } from '../utils/matching';
import { track } from '@vercel/analytics';
import { APP_CONFIG } from '../config/appConfig';
import { haptic } from '../utils/haptics';
import { useFocusTrap } from '../utils/useFocusTrap';
import { motion, AnimatePresence } from 'motion/react';
import { captureError } from '../utils/errorTracking';

/** Haversine distance between two GPS coordinates, in metres. */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Stable proximity tier based on two user IDs.
 *  Since GPS coords aren't stored, this gives each pair a consistent
 *  proximity label without revealing real positions. */
function stableProximityTier(idA: string, idB: string): 'nearby' | 'same-floor' | 'in-building' {
  const pair = [idA, idB].sort().join(':');
  let hash = 0;
  for (let i = 0; i < pair.length; i++) {
    hash = ((hash << 5) - hash + pair.charCodeAt(i)) | 0;
  }
  const bucket = Math.abs(hash % 10);
  // ~40% "Nearby", ~35% "Same floor", ~25% "In building"
  if (bucket < 4) return 'nearby';
  if (bucket < 7) return 'same-floor';
  return 'in-building';
}

/** Human-readable proximity label. */
function proximityLabel(tier: 'nearby' | 'same-floor' | 'in-building'): string {
  if (tier === 'nearby') return 'Nearby';
  if (tier === 'same-floor') return 'Same floor';
  return 'In building';
}

/** Freshness label based on last_seen_at timestamp. */
function freshnessInfo(lastSeenAt: string | null): { label: string; color: string; dotClass: string } {
  if (!lastSeenAt) return { label: '', color: 'var(--color-steel-light)', dotClass: 'bg-[var(--color-steel-light)]' };
  const mins = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 60000);
  if (mins < 5) return { label: 'Just arrived', color: 'var(--color-success)', dotClass: 'bg-[var(--color-success)]' };
  if (mins < 15) return { label: 'Active', color: 'var(--color-primary)', dotClass: 'bg-[var(--color-primary)]' };
  return { label: `${mins}m ago`, color: 'var(--color-steel-light)', dotClass: 'bg-[var(--color-steel-light)]' };
}

type PresenceStatus = 'checking' | 'present' | 'absent' | 'manual' | 'gps_denied' | 'gps_unavailable';

const MOCK_PROXIMITY: Record<string, 'nearby' | 'same-floor' | 'in-building'> = {
  'user-1': 'nearby',
  'user-2': 'nearby',
  'user-3': 'same-floor',
  'user-4': 'in-building',
  'user-5': 'same-floor',
};

interface Profile {
  id: string;
  full_name: string;
  interests: string[];
  profession?: string;
  company?: string;
  avatar_url?: string;
}

type MatchProfile = Profile & { overlap: string[]; proximity: 'nearby' | 'same-floor' | 'in-building'; last_seen_at?: string | null };

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
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('event');
  const [eventName, setEventName] = useState<string | null>(null);
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
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hiddenSince = useRef<number | null>(null);

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
  const [newArrivalName, setNewArrivalName] = useState<string | null>(null);
  const prevMatchIds = useRef<Set<string>>(new Set());
  const [showGpsExplainer, setShowGpsExplainer] = useState(false);
  const gpsExplainerResolve = useRef<((v: boolean) => void) | null>(null);
  const [icebreakers, setIcebreakers] = useState<string[]>([]);
  const [icebreakersLoading, setIcebreakersLoading] = useState(false);
  const modalFocusTrapRef = useFocusTrap<HTMLDivElement>(!!selectedMatch);
  const gpsModalFocusTrapRef = useFocusTrap<HTMLDivElement>(showGpsExplainer);

  /** Check venue WiFi presence via server-side IP match — fast, no permissions needed. */
  const checkWifiPresence = React.useCallback(async (): Promise<{ onsite: boolean; configured: boolean }> => {
    try {
      const res = await fetch('/api/presence-check');
      if (!res.ok) return { onsite: false, configured: false };
      return await res.json();
    } catch {
      return { onsite: false, configured: false };
    }
  }, []);

  /** Trigger the actual browser GPS request (called after explainer or directly). */
  const doGpsCheck = React.useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const dist = haversineDistance(
            pos.coords.latitude, pos.coords.longitude,
            APP_CONFIG.VENUE_LAT, APP_CONFIG.VENUE_LNG
          );
          const atVenue = dist <= APP_CONFIG.PRESENCE_RADIUS_M;
          setPresenceStatus(atVenue ? 'present' : 'absent');
          const now = new Date().toISOString();
          try {
            await supabase.rpc('update_presence', {
              p_is_present: atVenue,
              p_last_seen_at: atVenue ? now : now,
            });
          } catch (err) { captureError(err, { context: 'CampusRadar.updatePresence' }); }
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

  /** Presence check: WiFi first (instant, no prompt), GPS fallback. */
  const checkPresence = React.useCallback(async (): Promise<boolean> => {
    if (!user || isDemo) return true;

    // Plan A: WiFi IP match — instant, no permission needed
    const wifi = await checkWifiPresence();
    if (wifi.configured && wifi.onsite) {
      setPresenceStatus('present');
      const now = new Date().toISOString();
      try {
        await supabase.rpc('update_presence', {
          p_is_present: true,
          p_last_seen_at: now,
        });
      } catch (err) { captureError(err, { context: 'CampusRadar.wifiPresence' }); }
      return true;
    }

    // Plan B: GPS geofence — requires permission
    if (!navigator.geolocation) {
      setPresenceStatus('gps_unavailable');
      return false;
    }
    const permState = await navigator.permissions?.query?.({ name: 'geolocation' }).catch(() => null);
    if (permState && permState.state !== 'prompt') {
      return doGpsCheck();
    }
    if (!localStorage.getItem('gravity-gps-explained')) {
      return new Promise((resolve) => {
        gpsExplainerResolve.current = resolve;
        setShowGpsExplainer(true);
      });
    }
    return doGpsCheck();
  }, [user, isDemo, checkWifiPresence, doGpsCheck]);

  const handleGpsExplainerAllow = () => {
    localStorage.setItem('gravity-gps-explained', '1');
    setShowGpsExplainer(false);
    doGpsCheck().then((result) => {
      gpsExplainerResolve.current?.(result);
      gpsExplainerResolve.current = null;
    });
  };

  const handleGpsExplainerSkip = () => {
    localStorage.setItem('gravity-gps-explained', '1');
    setShowGpsExplainer(false);
    setPresenceStatus('gps_denied');
    gpsExplainerResolve.current?.(false);
    gpsExplainerResolve.current = null;
  };

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

      const nearby: MatchProfile[] = others
        .map((p) => ({
          ...p,
          overlap: getInterestOverlap(me as Profile, p as Profile),
          proximity: MOCK_PROXIMITY[p.id] ?? 'nearby' as const,
          last_seen_at: new Date(Date.now() - Math.random() * 20 * 60000).toISOString(),
        }))
        .sort((a, b) => b.overlap.length - a.overlap.length || (a.proximity === 'nearby' ? -1 : 1));

      setMatches(nearby);

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

    // Event mode: fetch event attendees instead of venue-present users
    let profiles: any[] | null = null;
    let pError: any = null;

    if (eventId) {
      // Fetch event metadata
      const { data: evt } = await supabase.from('events').select('name').eq('id', eventId).maybeSingle();
      setEventName(evt?.name || 'Event');

      // Fetch attendee user IDs
      const { data: checkins } = await supabase
        .from('event_checkins')
        .select('user_id')
        .eq('event_id', eventId);
      const attendeeIds = (checkins || []).map(c => c.user_id);
      // Always include self
      if (!attendeeIds.includes(user.id)) attendeeIds.push(user.id);

      if (attendeeIds.length > 0) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, interests, profession, company, avatar_url, is_incognito, is_present, last_seen_at')
          .in('id', attendeeIds);
        profiles = data;
        pError = error;
      } else {
        profiles = [];
      }
    } else {
      // Default venue mode: fetch users who are currently present (30-min freshness window)
      const stalenessCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const result = await supabase
        .from('profiles')
        .select('id, full_name, interests, profession, company, avatar_url, is_incognito, is_present, last_seen_at')
        .or(`id.eq.${user.id},and(is_present.eq.true,last_seen_at.gte.${stalenessCutoff})`);
      profiles = result.data;
      pError = result.error;
      setEventName(null);
    }

    if (pError || !profiles) {
      setError('Unable to load nearby profiles. Retrying...');
      setLoading(false);
      return;
    }

    // Fetch blocked users to exclude them
    const { data: blocks } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', user.id);
    const blockedIds = new Set((blocks || []).map(b => b.blocked_id));

    const me = profiles.find((p: any) => p.id === user.id);
    // In event mode, show all attendees (not just is_present); in venue mode, require is_present
    const others = profiles.filter((p: any) => p.id !== user.id && !p.is_incognito && !blockedIds.has(p.id) && (eventId || p.is_present));
    setUserProfile(me || null);

    {
      const proximityOrder = { 'nearby': 0, 'same-floor': 1, 'in-building': 2 };
      const nearby: MatchProfile[] = others
        .map((p) => ({
          ...p,
          overlap: me?.interests ? getInterestOverlap(me as Profile, p as Profile) : [],
          proximity: stableProximityTier(user.id, p.id),
          last_seen_at: p.last_seen_at,
        }))
        .sort((a, b) => b.overlap.length - a.overlap.length || proximityOrder[a.proximity] - proximityOrder[b.proximity]);

      // Detect new arrivals (someone who wasn't in the previous match set)
      const currentIds = new Set(nearby.map(m => m.id));
      if (prevMatchIds.current.size > 0) {
        for (const m of nearby) {
          if (!prevMatchIds.current.has(m.id)) {
            const firstName = m.full_name?.split(' ')[0] || 'Someone';
            setNewArrivalName(firstName);
            haptic('light');
            setTimeout(() => setNewArrivalName(null), 4000);
            break;
          }
        }
      }
      prevMatchIds.current = currentIds;
      setMatches(nearby);
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
  }, [user, isDemo, stagePendingRequest, eventId]);

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
      checkPresence().then(() => fetchData());
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
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          // Auto-reconnect after channel error
          setTimeout(() => { supabase.removeChannel(channel); fetchData(); }, 5000);
        }
      });

    // Presence heartbeat: WiFi-first, GPS fallback — every 2 minutes while page is visible
    if (!isDemo) {
      heartbeatTimer.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          checkPresence().then(() => debouncedFetch());
        }
      }, 2 * 60 * 1000);
    }

    // Refresh data when app comes back to foreground + departure detection
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Coming back to foreground
        const wasHiddenMs = hiddenSince.current ? Date.now() - hiddenSince.current : 0;
        hiddenSince.current = null;

        if (wasHiddenMs > 5 * 60 * 1000 && !isDemo) {
          // Gone for >5 min — re-check presence (they may have left the venue)
          checkPresence().then(() => fetchData());
        } else {
          debouncedFetch();
        }
      } else {
        // Going to background — record the time
        hiddenSince.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchData, checkPresence, isDemo, doGpsCheck]);

  // Fetch icebreakers when modal opens
  useEffect(() => {
    if (selectedMatch && connectionStatuses[selectedMatch.id] !== 'accepted') {
      fetchIcebreakers(selectedMatch);
    } else {
      setIcebreakers([]);
    }
  }, [selectedMatch]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Fetch icebreaker suggestions based on the match's profile and shared interests. */
  const fetchIcebreakers = React.useCallback(async (match: MatchProfile) => {
    setIcebreakers([]);
    setIcebreakersLoading(true);
    const shared = match.overlap || [];
    const profession = match.profession || '';

    try {
      // Try edge function for real-time news-based icebreakers
      const { data, error: fnErr } = await supabase.functions.invoke('icebreaker-suggestions', {
        body: { interests: match.interests || [], profession, shared_interests: shared },
      });
      if (!fnErr && data?.suggestions?.length > 0) {
        setIcebreakers(data.suggestions);
        setIcebreakersLoading(false);
        return;
      }
    } catch (err) { captureError(err, { context: 'CampusRadar.icebreakers' }); }

    // Fallback: generate template-based icebreakers from profile data
    const suggestions: string[] = [];
    if (shared.length > 0) {
      suggestions.push(`We both share an interest in ${shared[0]} — I'd love to hear what got you into it!`);
    }
    if (shared.length > 1) {
      suggestions.push(`I noticed we're both into ${shared[0]} and ${shared[1]}. Would love to swap notes!`);
    }
    if (profession) {
      suggestions.push(`Your work in ${profession} sounds fascinating — what are you currently focused on?`);
    }
    if (suggestions.length === 0) {
      suggestions.push("Hi! I saw you're nearby — always great to meet new people at Gummifabriken!");
    }
    setIcebreakers(suggestions.slice(0, 3));
    setIcebreakersLoading(false);
  }, []);

  const handleSendRequest = async () => {
    if (!selectedMatch) return;
    haptic('medium');
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
      setShowSuccess(true); haptic('success');
      track('connection_request_sent', { mode: 'demo', target_id: recipientId });
      return;
    }

    if (!user) return;

    const { error: rpcError } = await supabase.rpc('send_connection_request', {
      p_recipient_id: recipientId,
      p_message: invitationMessage.trim() || null,
    });

    if (rpcError) {
      let msg = 'Failed to send request. Please try again.';
      if (rpcError.message.includes('duplicate') || rpcError.message.includes('already exists')) {
        msg = 'Connection already exists.';
      } else if (rpcError.message.includes('rate') || rpcError.message.includes('limit') || rpcError.message.includes('too many')) {
        msg = 'Slow down — too many requests. Try again in a few minutes.';
      }
      setError(msg);
      setSendingTo(null);
      setSelectedMatch(null);
      setInvitationMessage('');
      return;
    }

    setConnectionStatuses((prev) => ({ ...prev, [recipientId]: 'pending_sent' }));
    setShowSuccess(true); haptic('success');
    track('connection_request_sent', { mode: 'live', target_id: recipientId });
    setSendingTo(null);
    setSelectedMatch(null);
    setInvitationMessage('');
  };

  const handleAcceptConnection = async (connectionId: string) => {
    haptic('success');
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
    haptic('light');
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
      <div className="min-h-screen bg-[var(--color-bg-warm)] pb-28">
        <div className="max-w-lg mx-auto px-6 pt-6">
          {/* Skeleton status row */}
          <div className="flex items-center justify-between mb-6">
            <div className="skeleton h-4 w-20 rounded-full" />
            <div className="skeleton h-7 w-24 rounded-full" />
          </div>
          {/* Skeleton radar circle */}
          <div className="w-80 h-80 mx-auto mb-12 rounded-full skeleton opacity-40" />
          {/* Skeleton section header */}
          <div className="flex items-center justify-between mb-4">
            <div className="skeleton h-3 w-36" />
            <div className="skeleton h-3 w-16" />
          </div>
          {/* Skeleton cards */}
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 p-4 mb-3 bg-[var(--color-bg-card)] border border-[var(--color-sand)] rounded-2xl">
              <div className="skeleton w-12 h-12 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-3 w-20" />
              </div>
              <div className="skeleton h-8 w-8 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const pendingReceivedCount = Object.values(connectionStatuses).filter(s => s === 'pending_received').length;

  const pipLayout = [
    { angle: 30, r: 42 },
    { angle: 85, r: 70 },
    { angle: 140, r: 50 },
    { angle: 190, r: 90 },
    { angle: 235, r: 55 },
    { angle: 280, r: 78 },
    { angle: 320, r: 95 },
    { angle: 5, r: 85 },
    { angle: 55, r: 100 },
    { angle: 160, r: 68 },
  ];
  const maxPips = Math.min(matches.length, pipLayout.length);

  return (
    <div className="min-h-screen bg-[#0D0B09] pb-28 text-[#E8E0D4]">
      <div className="max-w-lg mx-auto px-6 pt-6">

        {/* ── Header ── */}
        <h1 className="font-serif text-2xl text-white mb-5 tracking-tight">Gravity.</h1>

        {/* ── Event mode banner ── */}
        {eventName && (
          <div className="mb-4 bg-[var(--color-accent)]/8 border border-[var(--color-accent)]/25 rounded-2xl px-4 py-3 flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <p className="text-[13px] text-[var(--color-text-primary)] font-semibold flex-1 truncate">{eventName}</p>
            <Link to="/events" className="text-[11px] font-bold text-[var(--color-accent)] hover:underline flex-shrink-0">
              All Events
            </Link>
          </div>
        )}

        {/* ── Plan B: Manual check-in banner (GPS denied / outside venue) ── */}
        <AnimatePresence>
          {(presenceStatus === 'gps_denied' || presenceStatus === 'gps_unavailable') && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4"
            >
              <div className="bg-[var(--color-accent)]/8 border border-[var(--color-accent)]/20 rounded-2xl px-4 py-3.5 flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                <p className="text-[13px] text-[var(--color-text-secondary)] flex-1">
                  {presenceStatus === 'gps_denied' ? 'Location access denied.' : 'GPS unavailable.'}{' '}
                  Confirm you're at {APP_CONFIG.LOCATION_NAME}.
                </p>
                <button
                  onClick={handleManualCheckIn}
                  className="flex-shrink-0 text-[12px] font-bold text-white bg-[var(--color-primary)] px-3 py-1.5 rounded-full hover:bg-[var(--color-primary-dark)] transition-colors"
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                <p className="text-[13px] text-[#A09890] flex-1">
                  You're not at {APP_CONFIG.LOCATION_NAME} right now. Radar shows who's present.
                </p>
                <button
                  onClick={handleManualCheckIn}
                  className="flex-shrink-0 text-[12px] font-bold text-[var(--color-primary-light)] px-3 py-1.5 rounded-full border border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/10 transition-colors"
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
                <div className="bg-[var(--color-accent)]/8 border border-[var(--color-accent)]/25 rounded-2xl px-4 py-3.5 flex items-center gap-3">
                  <span className="w-2.5 h-2.5 bg-[var(--color-accent)] rounded-full animate-gentle-pulse flex-shrink-0" />
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] flex-1">
                    {pendingReceivedCount} connection request{pendingReceivedCount !== 1 ? 's' : ''} waiting
                  </p>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </div>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status badge row */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-[13px] text-[var(--color-steel-light)]">
            {eventName ? 'Event radar' : `${APP_CONFIG.RADAR_RADIUS} radius`}
          </p>
          {presenceStatus === 'present' || presenceStatus === 'manual' || isDemo ? (
            <div className="flex items-center gap-1.5 bg-transparent border border-[var(--color-accent)]/40 px-3.5 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-gentle-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-accent)]">Scanning</span>
            </div>
          ) : presenceStatus === 'checking' ? (
            <div className="flex items-center gap-1.5 bg-transparent border border-[var(--color-steel)] px-3.5 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-[var(--color-steel-light)] rounded-full animate-gentle-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-steel-light)]">Locating...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-transparent border border-[var(--color-steel)] px-3.5 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-[var(--color-steel)] rounded-full" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-steel-light)]">Offline</span>
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
            className="absolute inset-0 rounded-full border border-[var(--color-primary)]/30"
            style={{ background: 'radial-gradient(circle, rgba(184,115,51,0.08) 0%, rgba(13,11,9,0.9) 60%, #0D0B09 100%)' }}
          >
            {/* Concentric rings */}
            {[0.78, 0.56, 0.34].map((scale, i) => (
              <div key={i} className="absolute inset-0 border border-[var(--color-primary)]/15 rounded-full" style={{ transform: `scale(${scale})` }} />
            ))}
            {/* Cross-hair grid lines */}
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-px bg-[var(--color-primary)]/10" />
            <div className="absolute left-0 right-0 top-1/2 -translate-y-px h-px bg-[var(--color-primary)]/10" />
            {/* Diagonal grid lines */}
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div className="absolute top-1/2 left-1/2 w-[141%] h-px bg-[var(--color-primary)]/8 origin-left" style={{ transform: 'translate(-50%, -50%) rotate(45deg)' }} />
              <div className="absolute top-1/2 left-1/2 w-[141%] h-px bg-[var(--color-primary)]/8 origin-left" style={{ transform: 'translate(-50%, -50%) rotate(-45deg)' }} />
            </div>
            {/* Rotating sweep beam */}
            <div className="absolute inset-0 rounded-full animate-scan origin-center pointer-events-none z-10">
              <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, rgba(212,175,55,0.28) 0deg, rgba(184,115,51,0.12) 20deg, transparent 55deg)' }} />
              <div className="absolute top-0 left-1/2 -translate-x-px w-0.5 h-1/2 origin-bottom" style={{ background: 'linear-gradient(to top, rgba(212,175,55,0.6), transparent)' }} />
            </div>
            {/* Pulse ring */}
            <div className="absolute inset-0 rounded-full border border-[var(--color-primary)]/25 animate-radar-pulse" />
          </div>

          {/* Center logo */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
            <div className="relative">
              <div className="absolute -inset-3 rounded-full blur-xl bg-[var(--color-primary)]/30" />
              <img src={logoUrl} alt="Gravity" className="relative w-12 h-12 rounded-full object-cover shadow-[0_0_24px_rgba(184,115,51,0.5)] border-2 border-[var(--color-primary)]/60" />
            </div>
          </div>

          {/* Pips */}
          {matches.slice(0, maxPips).map((match, idx) => {
            const { angle, r } = pipLayout[idx] || { angle: idx * 60, r: 60 };
            const rad = (angle * Math.PI) / 180;
            const scaledR = r * 1.1;
            const x = Math.cos(rad) * scaledR;
            const y = Math.sin(rad) * scaledR;
            const status = connectionStatuses[match.id] || 'none';
            const isRevealed = status === 'accepted';
            const hasOverlap = match.overlap.length > 0;
            const freshness = freshnessInfo(match.last_seen_at || null);
            const borderColor = status === 'accepted'
              ? 'border-[var(--color-success)]'
              : status === 'pending_sent' || status === 'pending_received'
                ? 'border-[var(--color-accent)]'
                : hasOverlap ? 'border-[var(--color-primary)]/50' : 'border-[var(--color-steel)]/60';

            return (
              <button
                key={match.id}
                className="absolute top-1/2 left-1/2 z-20 cursor-pointer group"
                style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
                onClick={() => setSelectedMatch(match)}
                aria-label={isRevealed ? `Match: ${match.full_name}` : `Match: ${match.profession || 'Professional'}`}
              >
                <div className="relative">
                  <div className={`w-9 h-9 rounded-full overflow-hidden border-2 ${borderColor} shadow-[0_0_12px_rgba(184,115,51,0.3)] transition-transform group-hover:scale-125`}>
                    {isRevealed ? (
                      match.avatar_url ? (
                        <img src={match.avatar_url} alt={match.full_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[var(--color-primary)] flex items-center justify-center text-white text-xs font-serif font-bold">
                          {match.full_name.charAt(0)}
                        </div>
                      )
                    ) : (
                      <div className="w-full h-full bg-[#1A1714] flex items-center justify-center">
                        <span className="text-[11px] font-serif font-bold text-[var(--color-accent)]/70">G</span>
                      </div>
                    )}
                  </div>
                  {/* Freshness dot */}
                  <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#0D0B09] ${freshness.dotClass}`} />
                </div>
                {/* Proximity label */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 whitespace-nowrap pointer-events-none">
                  <span className="text-[9px] font-semibold text-[var(--color-steel-light)]">{proximityLabel(match.proximity)}</span>
                </div>
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-8 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="bg-[#1A1714] text-[#E8E0D4] text-[10px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap shadow-lg border border-[var(--color-primary)]/20">
                    {isRevealed ? match.full_name.split(' ')[0] : (match.profession || 'Professional')}
                    {freshness.label && <span className="text-[9px] ml-1" style={{ color: freshness.color }}>· {freshness.label}</span>}
                  </div>
                </div>
              </button>
            );
          })}

          {/* +N more indicator */}
          {matches.length > maxPips && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20">
              <span className="text-[10px] font-bold text-[var(--color-accent)] bg-[#1A1714]/90 backdrop-blur-sm px-2.5 py-1 rounded-full border border-[var(--color-accent)]/30 shadow-sm">
                +{matches.length - maxPips} more nearby
              </span>
            </div>
          )}
        </div>

        {/* ── Scan Summary Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative -mt-6 mb-8 bg-[#1A1714] border border-[#2A2522] rounded-3xl p-5 shadow-lg overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--color-primary)]/40 to-transparent" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-serif font-bold text-[var(--color-primary)]">G</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold text-white">
                {matches.length} Active
              </p>
              <p className="text-[13px] text-[#A09890]">
                {matches.length > 0
                  ? 'Scanning local connections...\nFinding matches.'
                  : presenceStatus === 'present' || presenceStatus === 'manual' || isDemo
                    ? 'Scanning local connections...\nFinding matches.'
                    : `Head to ${APP_CONFIG.LOCATION_NAME} to start scanning.`}
              </p>
            </div>
            <div className="flex-shrink-0">
              {(presenceStatus === 'present' || presenceStatus === 'manual' || isDemo) && (
                <div className="w-3 h-3 bg-[var(--color-success)] rounded-full animate-gentle-pulse" />
              )}
            </div>
          </div>
        </motion.div>

        {/* New arrival toast */}
        <AnimatePresence>
          {newArrivalName && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.95 }}
              className="mb-4 bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-2xl px-4 py-3 flex items-center gap-3"
            >
              <span className="w-2 h-2 bg-[var(--color-success)] rounded-full animate-gentle-pulse flex-shrink-0" />
              <p className="text-[13px] font-medium text-[var(--color-success)]">{newArrivalName} just arrived at {APP_CONFIG.LOCATION_NAME}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Activity Feed */}
        {activityFeed.length > 0 && (
          <div className="mb-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-3">Live Activity</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {activityFeed.map((item) => (
                <div key={item.id} className="flex-shrink-0 bg-[#1A1714]/80 backdrop-blur-sm border border-[#2A2522] rounded-full px-3 py-1.5 flex items-center gap-2">
                  {item.type === 'join' ? (
                    <span className="w-1.5 h-1.5 bg-[var(--color-success)] rounded-full" />
                  ) : (
                    <span className="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full" />
                  )}
                  <span className="text-[11px] text-[var(--color-text-primary)] font-medium whitespace-nowrap">{item.text}</span>
                  <span className="text-[10px] text-[var(--color-steel-light)] whitespace-nowrap">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)]">
            {eventName ? 'Event Attendees' : 'Nearby Professionals'}
          </h3>
          <span className="text-[12px] font-semibold text-[var(--color-primary-light)]">{matches.length} Active</span>
        </div>

        {/* Match list */}
        {matches.length === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#1A1714] border border-[#2A2522] rounded-[2rem] p-12 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
              {presenceStatus === 'present' || presenceStatus === 'manual' || isDemo ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/></svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              )}
            </div>
            <h3 className="font-serif text-lg text-[var(--color-text-primary)] mb-2">
              {presenceStatus === 'present' || presenceStatus === 'manual' || isDemo
                ? 'Scanning the airwaves...'
                : 'The radar awaits'}
            </h3>
            <p className="text-sm text-[var(--color-steel-light)] max-w-[260px] mx-auto">
              {presenceStatus === 'present' || presenceStatus === 'manual' || isDemo
                ? "No one is checked in right now. They'll appear the moment they arrive."
                : `Head to ${APP_CONFIG.LOCATION_NAME} and your radar will light up with nearby professionals.`}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-3 pb-20">
            {matches.map((match, i) => {
              const status = connectionStatuses[match.id] || 'none';
              const isRevealed = status === 'accepted';
              const freshness = freshnessInfo(match.last_seen_at || null);

              return (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <button
                    onClick={() => { if (!isRevealed) setSelectedMatch(match); }}
                    className="w-full p-4 flex items-center gap-4 text-left bg-[#1A1714] border border-[#2A2522] rounded-2xl transition-all hover:border-[var(--color-primary)]/30 hover:shadow-[0_4px_20px_rgba(184,115,51,0.12)]"
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
                      <div className="w-12 h-12 rounded-full bg-[#2A2522] flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-serif font-bold text-[var(--color-accent)]/60">G</span>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {isRevealed ? (
                        <>
                          <h4 className="font-serif text-base text-[var(--color-text-primary)] mb-0.5">{match.full_name}</h4>
                          <p className="text-[13px] text-[var(--color-steel-light)] truncate">{match.profession || 'Professional'}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-serif text-base text-[var(--color-text-primary)] mb-1.5">{match.profession || 'Professional'}</p>
                          <div className="flex flex-wrap gap-1">
                            {match.overlap.length > 0 ? (
                              <>
                                {match.overlap.slice(0, 3).map((interest) => (
                                  <span key={interest} className="text-[10px] font-medium text-[var(--color-primary-light)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded-full border border-[var(--color-primary)]/15">
                                    {interest}
                                  </span>
                                ))}
                                {match.overlap.length > 3 && (
                                  <span className="text-[10px] text-[var(--color-steel-light)] px-1 py-0.5">+{match.overlap.length - 3}</span>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] font-medium text-[var(--color-steel-light)] bg-[#2A2522] px-2 py-0.5 rounded-full">
                                Nearby
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Distance + match % + action */}
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${freshness.dotClass}`} />
                          <span className="text-[12px] font-semibold text-[var(--color-primary-light)]">{proximityLabel(match.proximity)}</span>
                        </span>
                        {match.overlap.length > 0 ? (
                          <span className="relative group/pct cursor-help">
                            <span className="text-[11px] font-bold text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-2 py-0.5 rounded-full">
                              {userProfile?.interests ? Math.round((match.overlap.length / userProfile.interests.length) * 100) : 0}%
                            </span>
                            <span className="absolute bottom-full right-0 mb-2 w-48 bg-[#1A1714] border border-[#2A2522] rounded-lg px-3 py-2 shadow-lg opacity-0 group-hover/pct:opacity-100 pointer-events-none transition-opacity z-50 text-left">
                              <span className="block text-[10px] font-bold text-white mb-0.5">Interest Match</span>
                              <span className="block text-[10px] text-[#A09890]">
                                {match.overlap.length} of your {userProfile?.interests?.length || 0} interests overlap: {match.overlap.slice(0, 3).join(', ')}{match.overlap.length > 3 ? '...' : ''}
                              </span>
                            </span>
                          </span>
                        ) : (
                          <span className="relative group/new cursor-help">
                            <span className="text-[11px] font-medium text-[var(--color-steel-light)] bg-[#2A2522] px-2 py-0.5 rounded-full">
                              New
                            </span>
                            <span className="absolute bottom-full right-0 mb-2 w-44 bg-[#1A1714] border border-[#2A2522] rounded-lg px-3 py-2 shadow-lg opacity-0 group-hover/new:opacity-100 pointer-events-none transition-opacity z-50 text-left">
                              <span className="block text-[10px] text-[#A09890]">No shared interests yet — but proximity is a great start!</span>
                            </span>
                          </span>
                        )}
                      </div>
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
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-primary-light)]">Awaiting Reply</span>
                      ) : status === 'pending_received' ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-error)] bg-[var(--color-error)]/10 px-2.5 py-1 rounded-full animate-gentle-pulse">Respond</span>
                      ) : (
                        <div className="w-8 h-8 border border-[#2A2522] text-[var(--color-steel-light)] rounded-full flex items-center justify-center">
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

      {/* GPS explainer (shown once before browser prompt) */}
      <AnimatePresence>
        {showGpsExplainer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog" aria-modal="true" aria-label="Location permission"
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div
              ref={gpsModalFocusTrapRef}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1A1714] w-full max-w-sm rounded-3xl p-8 shadow-xl border border-[#2A2522] text-center"
            >
              <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <h3 className="font-serif text-xl text-[var(--color-text-header)] mb-2">Enable location?</h3>
              <p className="text-sm text-[var(--color-text-secondary)] mb-6 leading-relaxed">
                Gravity uses your location to check if you're at {APP_CONFIG.LOCATION_NAME}. Your coordinates are <strong>never stored</strong> — we only check proximity.
              </p>
              <button
                onClick={handleGpsExplainerAllow}
                className="btn-primary w-full py-3.5 text-sm mb-3"
              >
                Allow Location
              </button>
              <button
                onClick={handleGpsExplainerSkip}
                className="w-full py-2.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                Skip — I'll check in manually
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error toast */}
      <div aria-live="assertive" className="contents">
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            role="alert"
            className="fixed top-4 left-1/2 -translate-x-1/2 bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 px-6 py-3 rounded-full shadow-lg z-[110] flex items-center gap-3">
            <p className="text-sm font-semibold text-[var(--color-error)]">{error}</p>
            <button onClick={() => { setError(null); fetchData(); }} className="text-xs font-bold text-[var(--color-error)] underline flex-shrink-0">Retry</button>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Success modal */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog" aria-modal="true" aria-label="Request sent"
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-end sm:items-center justify-center"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="bg-[#1A1714] w-full max-w-md rounded-t-3xl sm:rounded-3xl p-8 shadow-xl border border-[#2A2522]/50 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-[var(--color-success)]/12 flex items-center justify-center mx-auto mb-5 animate-celebrate-pop">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <h3 className="font-serif text-xl text-[var(--color-text-header)] mb-2">Connection Request Sent!</h3>
              <p className="text-sm text-[var(--color-text-secondary)] mb-6 max-w-[260px] mx-auto leading-relaxed">We'll notify you once they accept. In the meantime, explore more people nearby.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSuccess(false)}
                  className="flex-1 py-3.5 rounded-2xl bg-[#2A2522] text-[#A09890] text-sm font-semibold hover:bg-[#3A3532] transition-colors"
                >
                  Back to Radar
                </button>
              </div>
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
            onKeyDown={(e) => { if (e.key === 'Escape') { setSelectedMatch(null); setInvitationMessage(''); } }}
            role="dialog" aria-modal="true" aria-label="Connection request"
          >
            <motion.div
              ref={modalFocusTrapRef}
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="bg-[#1A1714] w-full max-w-md rounded-t-3xl sm:rounded-3xl p-8 shadow-xl border border-[#2A2522]/50"
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
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[12px] font-semibold text-[var(--color-primary)]">{proximityLabel(stableProximityTier(user?.id || '', selectedMatch.id))}</p>
                    {selectedMatch.overlap.length > 0 && userProfile?.interests && (
                      <span className="text-[11px] font-bold text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-2 py-0.5 rounded-full">
                        {Math.round((selectedMatch.overlap.length / userProfile.interests.length) * 100)}% match
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Shared interests */}
              {selectedMatch.overlap.length > 0 && (
                <div className="mb-6">
                  <p className="section-label mb-2">{selectedMatch.overlap.length} shared interests</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMatch.overlap.map((interest) => (
                      <span key={interest} className="text-[12px] font-medium text-[var(--color-primary-light)] bg-[var(--color-primary)]/10 px-3 py-1 rounded-full">
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Icebreaker suggestions */}
              {connectionStatuses[selectedMatch.id] !== 'accepted' && (
                <div className="mb-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-2">
                    Suggested openers
                  </p>
                  {icebreakersLoading ? (
                    <div className="flex gap-2">
                      <div className="skeleton h-8 w-32 rounded-full" />
                      <div className="skeleton h-8 w-40 rounded-full" />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {icebreakers.map((suggestion, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setInvitationMessage(suggestion)}
                          className={`text-left text-[12px] px-3 py-2 rounded-xl border transition-all ${
                            invitationMessage === suggestion
                              ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary-light)]'
                              : 'border-[#2A2522] text-[#A09890] hover:border-[var(--color-steel)] hover:bg-[#2A2522]/50'
                          }`}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Message */}
              <textarea
                className="input-field min-h-[90px] resize-none mb-6 !bg-[#0D0B09] !border-[#2A2522] !text-[#E8E0D4]"
                placeholder="Introduce yourself... or tap a suggestion above"
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
            role="dialog" aria-modal="true" aria-label="Incoming connection request"
            className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[200] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#1A1714] w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-[#2A2522] overflow-hidden relative"
            >
              {/* Profile Header */}
              <div className="bg-[var(--color-primary)]/10 pt-12 pb-8 px-8 text-center border-b border-[#2A2522]/50">
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
                    <span key={interest} className="text-[10px] font-semibold text-[var(--color-primary-light)] bg-[var(--color-primary)]/10 px-3 py-1 rounded-full border border-[var(--color-primary)]/15">
                      {interest}
                    </span>
                  ))}
                </div>

                {/* Message display */}
                {pendingReviewRequest.message && (
                  <div className="bg-[#0D0B09]/80 backdrop-blur-md rounded-2xl p-5 border border-[#2A2522]/60 italic">
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
                    {updatingId === pendingReviewRequest.connectionId ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Connecting...
                      </span>
                    ) : 'Accept Connection'}
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
