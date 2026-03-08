import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { motion, AnimatePresence } from 'motion/react';
import { APP_CONFIG } from '../config/appConfig';
import { haptic } from '../utils/haptics';
import { useFocusTrap } from '../utils/useFocusTrap';

interface GravityEvent {
  id: string;
  name: string;
  description: string | null;
  location_name: string;
  starts_at: string;
  ends_at: string;
  invite_code: string;
  created_by: string;
  checkin_count?: number;
  is_checked_in?: boolean;
  attendee_avatars?: string[];
}

function formatEventTime(starts: string, ends: string) {
  const s = new Date(starts);
  const e = new Date(ends);
  const now = new Date();
  const dateOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

  const isToday = s.toDateString() === now.toDateString();
  const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === s.toDateString();
  const dateLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : s.toLocaleDateString(undefined, dateOpts);

  return `${dateLabel}, ${s.toLocaleTimeString(undefined, timeOpts)} – ${e.toLocaleTimeString(undefined, timeOpts)}`;
}

function isEventLive(event: GravityEvent) {
  const now = new Date();
  return new Date(event.starts_at) <= now && now <= new Date(event.ends_at);
}

function isEventUpcoming(event: GravityEvent) {
  return new Date(event.starts_at) > new Date();
}

function isEventPast(event: GravityEvent) {
  return new Date(event.ends_at) < new Date() && !isEventLive(event);
}

export default function EventsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<GravityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [justCheckedIn, setJustCheckedIn] = useState<string | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLocation, setNewLocation] = useState(APP_CONFIG.LOCATION_NAME);
  const [newDate, setNewDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('17:00');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const createModalRef = useFocusTrap<HTMLDivElement>(showCreate);

  const fetchEvents = async () => {
    if (!user) return;
    setFetchError(false);
    // Fetch active + recent past events (last 7 days)
    const pastCutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: evts, error: evtError } = await supabase
      .from('events')
      .select('*')
      .gte('ends_at', pastCutoff)
      .order('starts_at', { ascending: true });

    if (evtError || !evts) { setFetchError(true); setLoading(false); return; }

    const eventIds = evts.map(e => e.id);
    const [{ data: checkins }, { data: attendeeProfiles }] = await Promise.all([
      supabase
        .from('event_checkins')
        .select('event_id, user_id')
        .in('event_id', eventIds.length > 0 ? eventIds : ['none']),
      supabase
        .from('event_checkins')
        .select('event_id, profiles:user_id(avatar_url)')
        .in('event_id', eventIds.length > 0 ? eventIds : ['none'])
        .limit(50),
    ]);

    const counts: Record<string, number> = {};
    const myCheckins = new Set<string>();
    (checkins || []).forEach(c => {
      counts[c.event_id] = (counts[c.event_id] || 0) + 1;
      if (c.user_id === user.id) myCheckins.add(c.event_id);
    });

    // Collect up to 4 avatar URLs per event
    const avatarsByEvent: Record<string, string[]> = {};
    (attendeeProfiles || []).forEach((row: any) => {
      const eid = row.event_id;
      const url = row.profiles?.avatar_url;
      if (!url) return;
      if (!avatarsByEvent[eid]) avatarsByEvent[eid] = [];
      if (avatarsByEvent[eid].length < 4) avatarsByEvent[eid].push(url);
    });

    setEvents(evts.map(e => ({
      ...e,
      checkin_count: counts[e.id] || 0,
      is_checked_in: myCheckins.has(e.id),
      attendee_avatars: avatarsByEvent[e.id] || [],
    })));
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, [user]);

  const handleCreate = async () => {
    if (!user || !newName.trim() || !newLocation.trim()) return;
    setCreating(true);
    setCreateError('');

    const starts_at = new Date(`${newDate}T${newStartTime}`).toISOString();
    const ends_at = new Date(`${newDate}T${newEndTime}`).toISOString();

    if (new Date(ends_at) <= new Date(starts_at)) {
      setCreateError('End time must be after start time.');
      setCreating(false);
      return;
    }

    const { error } = await supabase.from('events').insert({
      name: newName.trim(),
      description: newDesc.trim() || null,
      location_name: newLocation.trim(),
      starts_at,
      ends_at,
      created_by: user.id,
    });

    if (error) {
      setCreateError('Failed to create event. Try again.');
      setCreating(false);
      return;
    }

    haptic('success');
    setCreateSuccess(true);
    setCreating(false);
    setTimeout(() => {
      setShowCreate(false);
      setCreateSuccess(false);
      setNewName('');
      setNewDesc('');
      fetchEvents();
    }, 1200);
  };

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) return;
    setJoinError('');
    const { data: evt } = await supabase
      .from('events')
      .select('id')
      .eq('invite_code', joinCode.trim().toLowerCase())
      .maybeSingle();

    if (!evt) {
      setJoinError('Event not found. Check the code and try again.');
      return;
    }

    await handleCheckIn(evt.id);
    setJoinCode('');
  };

  const handleCheckIn = async (eventId: string) => {
    if (!user) return;
    haptic('medium');
    setCheckingIn(eventId);
    const { error } = await supabase.from('event_checkins').upsert({
      event_id: eventId,
      user_id: user.id,
    }, { onConflict: 'event_id,user_id' });

    if (!error) {
      haptic('success');
      setJustCheckedIn(eventId);
      setEvents(prev => prev.map(e =>
        e.id === eventId
          ? { ...e, is_checked_in: true, checkin_count: (e.checkin_count || 0) + 1 }
          : e
      ));
      setTimeout(() => setJustCheckedIn(null), 2000);
    }
    setCheckingIn(null);
  };

  const handleCheckOut = async (eventId: string) => {
    if (!user) return;
    setCheckingIn(eventId);
    await supabase.from('event_checkins').delete()
      .eq('event_id', eventId)
      .eq('user_id', user.id);

    setEvents(prev => prev.map(e =>
      e.id === eventId
        ? { ...e, is_checked_in: false, checkin_count: Math.max(0, (e.checkin_count || 0) - 1) }
        : e
    ));
    setCheckingIn(null);
  };

  const liveEvents = events.filter(isEventLive);
  const upcomingEvents = events.filter(isEventUpcoming);
  const pastEvents = events.filter(isEventPast);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-warm)] pb-28">
        <div className="max-w-lg mx-auto px-6 pt-6">
          <div className="flex items-center justify-between mb-6">
            <div className="skeleton h-8 w-24" />
            <div className="skeleton h-9 w-24 rounded-full" />
          </div>
          <div className="card p-4 mb-6">
            <div className="skeleton h-3 w-36 mb-3" />
            <div className="skeleton h-10 w-full rounded-xl" />
          </div>
          {[1, 2].map(i => (
            <div key={i} className="card p-4 mb-3">
              <div className="skeleton h-5 w-48 mb-2" />
              <div className="skeleton h-3 w-36 mb-3" />
              <div className="skeleton h-10 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-warm)] pb-28">
        <div className="max-w-lg mx-auto px-6 pt-8">
          <div className="card p-10 text-center mt-10">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[var(--color-error)]/8 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <h3 className="font-serif text-lg text-[var(--color-text-header)] mb-2">Couldn't load events</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-5">Check your internet connection and try again.</p>
            <button onClick={() => fetchEvents()} className="btn-primary px-6 py-2.5 text-xs">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] pb-28">
      <div className="max-w-lg mx-auto px-6 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-2xl text-[var(--color-text-header)]">Events</h1>
            {events.length > 0 && (
              <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5">
                {liveEvents.length > 0 ? `${liveEvents.length} happening now` : `${upcomingEvents.length} upcoming`}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="text-[12px] font-bold text-white bg-[var(--color-primary)] px-4 py-2.5 rounded-full hover:bg-[var(--color-primary-dark)] transition-colors flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create
          </button>
        </div>

        {/* Join by code */}
        <div className="card p-4 mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-3">Join with invite code</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value); setJoinError(''); }}
              placeholder="Enter 6-digit code"
              maxLength={6}
              className="flex-1 bg-[var(--color-bg-warm)] border border-[var(--color-sand)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-steel-light)] focus:border-[var(--color-primary)]/50 focus:outline-none uppercase tracking-widest text-center font-mono"
              aria-label="Invite code"
            />
            <button
              onClick={handleJoinByCode}
              disabled={!joinCode.trim()}
              className="bg-[var(--color-accent)] text-[var(--color-text-on-accent)] px-4 py-2.5 rounded-xl text-[12px] font-bold disabled:opacity-40 hover:bg-[var(--color-accent)]/80 transition-colors"
            >
              Join
            </button>
          </div>
          {joinError && (
            <p className="text-[12px] text-[var(--color-error)] mt-2 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {joinError}
            </p>
          )}
        </div>

        {/* Check-in celebration toast */}
        <AnimatePresence>
          {justCheckedIn && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-4 bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-2xl px-4 py-3 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--color-success)]/15 flex items-center justify-center flex-shrink-0 animate-success-check">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <p className="text-sm font-medium text-[var(--color-success)]">You're checked in! Open the radar to meet others.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live events */}
        {liveEvents.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-[var(--color-success)] rounded-full animate-gentle-pulse" />
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-success)]">Live Now</p>
            </div>
            <div className="space-y-3">
              {liveEvents.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  isLive
                  checkingIn={checkingIn === event.id}
                  onCheckIn={() => handleCheckIn(event.id)}
                  onCheckOut={() => handleCheckOut(event.id)}
                  onOpenRadar={() => navigate(`/radar?event=${event.id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Upcoming events */}
        {upcomingEvents.length > 0 && (
          <div className="mb-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-3">Upcoming</p>
            <div className="space-y-3">
              {upcomingEvents.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  isLive={false}
                  checkingIn={checkingIn === event.id}
                  onCheckIn={() => handleCheckIn(event.id)}
                  onCheckOut={() => handleCheckOut(event.id)}
                  onOpenRadar={() => navigate(`/radar?event=${event.id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Past events */}
        {pastEvents.length > 0 && (
          <div className="mb-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-3">Recent</p>
            <div className="space-y-3">
              {pastEvents.map(event => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card p-4 opacity-60"
                >
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-serif text-base text-[var(--color-text-header)] truncate flex-1">{event.name}</h3>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-steel-light)] bg-[var(--color-sand)]/50 px-2.5 py-1 rounded-full flex-shrink-0 ml-2">
                      Ended
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--color-text-secondary)]">
                    {formatEventTime(event.starts_at, event.ends_at)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {event.attendee_avatars && event.attendee_avatars.length > 0 && (
                      <div className="flex -space-x-2">
                        {event.attendee_avatars.slice(0, 3).map((url, i) => (
                          <img key={i} src={url} alt="" className="w-6 h-6 rounded-full border-2 border-[var(--color-bg-card)] object-cover" />
                        ))}
                      </div>
                    )}
                    <span className="text-[11px] text-[var(--color-steel-light)]">{event.checkin_count} attended</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {events.length === 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-[var(--color-primary)]/8 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <h3 className="font-serif text-xl text-[var(--color-text-header)] mb-2">No events yet</h3>
            <p className="text-sm text-[var(--color-text-secondary)] max-w-[280px] mx-auto leading-relaxed mb-6">
              Create an event for your next meetup, hackathon, or conference and invite others to join.
            </p>
            <button onClick={() => setShowCreate(true)} className="btn-primary inline-block px-8 py-3 text-xs">
              Create First Event
            </button>
          </motion.div>
        )}

        {/* Create event modal */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="dialog" aria-modal="true" aria-label="Create event"
              className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center"
              onClick={() => !creating && setShowCreate(false)}
              onKeyDown={(e) => e.key === 'Escape' && !creating && setShowCreate(false)}
            >
              <motion.div
                ref={createModalRef}
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                exit={{ y: 100 }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-lg bg-[var(--color-bg-card)] border-t border-[var(--color-sand)] rounded-t-3xl p-6 pb-10"
              >
                <div className="w-10 h-1 bg-[var(--color-sand)] rounded-full mx-auto mb-6" />

                {createSuccess ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-[var(--color-success)]/12 flex items-center justify-center mx-auto mb-4 animate-celebrate-pop">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    </div>
                    <h3 className="font-serif text-xl text-[var(--color-text-header)]">Event Created!</h3>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">Share the invite code to get people in.</p>
                  </div>
                ) : (
                  <>
                    <h2 className="font-serif text-xl text-[var(--color-text-header)] mb-6">Create Event</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-1.5 block">Event Name</label>
                        <input
                          type="text"
                          value={newName}
                          onChange={e => setNewName(e.target.value)}
                          placeholder="e.g. Friday Networking Fika"
                          maxLength={80}
                          className="w-full bg-[var(--color-bg-warm)] border border-[var(--color-sand)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-steel-light)] focus:border-[var(--color-primary)]/50 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-1.5 block">Description (optional)</label>
                        <textarea
                          value={newDesc}
                          onChange={e => setNewDesc(e.target.value)}
                          placeholder="What's this event about?"
                          maxLength={280}
                          rows={2}
                          className="w-full bg-[var(--color-bg-warm)] border border-[var(--color-sand)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-steel-light)] focus:border-[var(--color-primary)]/50 focus:outline-none resize-none"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-1.5 block">Location</label>
                        <input
                          type="text"
                          value={newLocation}
                          onChange={e => setNewLocation(e.target.value)}
                          placeholder="Venue name"
                          maxLength={100}
                          className="w-full bg-[var(--color-bg-warm)] border border-[var(--color-sand)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-steel-light)] focus:border-[var(--color-primary)]/50 focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-1.5 block">Date</label>
                          <input
                            type="date"
                            value={newDate}
                            onChange={e => setNewDate(e.target.value)}
                            className="w-full bg-[var(--color-bg-warm)] border border-[var(--color-sand)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)]/50 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-1.5 block">Start</label>
                          <input
                            type="time"
                            value={newStartTime}
                            onChange={e => setNewStartTime(e.target.value)}
                            className="w-full bg-[var(--color-bg-warm)] border border-[var(--color-sand)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)]/50 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-steel-light)] mb-1.5 block">End</label>
                          <input
                            type="time"
                            value={newEndTime}
                            onChange={e => setNewEndTime(e.target.value)}
                            className="w-full bg-[var(--color-bg-warm)] border border-[var(--color-sand)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)]/50 focus:outline-none"
                          />
                        </div>
                      </div>

                      {createError && (
                        <p className="text-[12px] text-[var(--color-error)] flex items-center gap-1.5">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          {createError}
                        </p>
                      )}

                      <button
                        onClick={handleCreate}
                        disabled={creating || !newName.trim()}
                        className="w-full bg-[var(--color-primary)] text-white py-3 rounded-xl font-bold text-sm disabled:opacity-40 hover:bg-[var(--color-primary-dark)] transition-colors"
                      >
                        {creating ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Creating...
                          </span>
                        ) : 'Create Event'}
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface EventCardProps {
  event: GravityEvent;
  isLive: boolean;
  checkingIn: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onOpenRadar: () => void;
}

const EventCard: React.FC<EventCardProps> = ({
  event,
  isLive,
  checkingIn,
  onCheckIn,
  onCheckOut,
  onOpenRadar,
}) => {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(event.invite_code);
    haptic('light');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      haptic('light');
      await navigator.share({
        title: event.name,
        text: `Join "${event.name}" on Gravity! Use invite code: ${event.invite_code}`,
        url: window.location.origin,
      }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card p-4 ${isLive ? '!border-[var(--color-success)]/30' : ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-base text-[var(--color-text-header)] truncate">{event.name}</h3>
          <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
            {formatEventTime(event.starts_at, event.ends_at)}
          </p>
        </div>
        {isLive && (
          <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-[var(--color-success)] bg-[var(--color-success)]/10 px-2.5 py-1 rounded-full border border-[var(--color-success)]/20">
            Live
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
        <span className="text-[12px] text-[var(--color-text-secondary)]">{event.location_name}</span>
        <span className="text-[10px] text-[var(--color-sand)]">|</span>
        {event.attendee_avatars && event.attendee_avatars.length > 0 && (
          <div className="flex -space-x-1.5">
            {event.attendee_avatars.slice(0, 3).map((url, i) => (
              <img key={i} src={url} alt="" className="w-5 h-5 rounded-full border border-[var(--color-bg-card)] object-cover" />
            ))}
          </div>
        )}
        <span className="text-[12px] text-[var(--color-primary)]">{event.checkin_count} checked in</span>
      </div>

      {event.description && (
        <p className="text-[13px] text-[var(--color-text-secondary)] mb-3 line-clamp-2">{event.description}</p>
      )}

      <div className="flex items-center gap-2">
        {event.is_checked_in ? (
          <>
            {isLive && (
              <button
                onClick={onOpenRadar}
                className="flex-1 bg-[var(--color-accent)] text-[var(--color-text-on-accent)] py-2.5 rounded-xl text-[12px] font-bold hover:bg-[var(--color-accent)]/80 transition-colors flex items-center justify-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                Open Radar
              </button>
            )}
            <button
              onClick={onCheckOut}
              disabled={checkingIn}
              className="px-4 py-2.5 rounded-xl text-[12px] font-bold text-[var(--color-steel-light)] border border-[var(--color-sand)] hover:border-[var(--color-steel)] transition-colors"
            >
              Leave
            </button>
          </>
        ) : (
          <button
            onClick={onCheckIn}
            disabled={checkingIn}
            className="flex-1 bg-[var(--color-primary)] text-white py-2.5 rounded-xl text-[12px] font-bold disabled:opacity-40 hover:bg-[var(--color-primary-dark)] transition-colors"
          >
            {checkingIn ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Joining...
              </span>
            ) : 'Check In'}
          </button>
        )}
        <button
          onClick={navigator.share ? handleNativeShare : () => setShowCode(!showCode)}
          className="px-3 py-2.5 rounded-xl text-[12px] text-[var(--color-steel-light)] border border-[var(--color-sand)] hover:border-[var(--color-steel)] transition-colors"
          title="Share invite code"
          aria-label="Share invite code"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </button>
      </div>

      <AnimatePresence>
        {showCode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-[var(--color-sand)] flex items-center justify-between">
              <div>
                <p className="text-[10px] text-[var(--color-steel-light)] uppercase tracking-widest mb-1">Invite Code</p>
                <p className="text-lg font-mono font-bold text-[var(--color-accent)] tracking-[0.3em] uppercase">{event.invite_code}</p>
              </div>
              <button
                onClick={handleCopy}
                className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition-all ${
                  copied
                    ? 'text-[var(--color-success)] border border-[var(--color-success)]/30 bg-[var(--color-success)]/5'
                    : 'text-[var(--color-primary)] border border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/10'
                }`}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
