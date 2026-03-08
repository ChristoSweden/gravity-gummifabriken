import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { MOCK_USERS, getDemoProfile, getDemoConnections, getDemoMessages } from '../services/mockData';
import { motion, AnimatePresence } from 'motion/react';
import { haptic } from '../utils/haptics';

interface Conversation {
  userId: string;
  fullName: string;
  profession: string;
  avatarUrl: string;
  lastMessage: string;
  lastMessageAt: string;
  isUnread: boolean;
  isOnline: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function ConversationsPage() {
  const { user, isDemo } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!user) return;

    const fetchConversations = async () => {
      setLoading(true);

      if (isDemo) {
        const me = getDemoProfile();
        const connections = getDemoConnections().filter((c) => c.status === 'accepted');
        const convos: Conversation[] = [];

        connections.forEach((conn) => {
          const otherId = conn.requester_id === me.id ? conn.recipient_id : conn.requester_id;
          const profile = MOCK_USERS.find((u) => u.id === otherId);
          if (!profile) return;
          const msgs = getDemoMessages(otherId);
          const lastMsg = msgs[msgs.length - 1];
          convos.push({
            userId: otherId,
            fullName: profile.full_name,
            profession: profile.profession || '',
            avatarUrl: profile.avatar_url || '',
            lastMessage: lastMsg?.content || '',
            lastMessageAt: lastMsg?.created_at || conn.created_at,
            isUnread: false,
            isOnline: Math.random() > 0.5,
          });
        });

        convos.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
        setConversations(convos);
        setLoading(false);
        return;
      }

      // Get accepted connections
      const { data: connections } = await supabase
        .from('connections')
        .select('requester_id, recipient_id')
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .eq('status', 'accepted');

      if (!connections || connections.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const otherIds = connections.map((c) =>
        c.requester_id === user.id ? c.recipient_id : c.requester_id
      );

      // Fetch profiles, latest messages, and presence in parallel
      const [{ data: profiles }, { data: messages }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, profession, avatar_url, last_seen_at, is_present').in('id', otherIds),
        supabase
          .from('messages')
          .select('sender_id, recipient_id, content, created_at, read_at')
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      const profileMap: Record<string, { full_name: string; profession: string; avatar_url: string; last_seen_at?: string; is_present?: boolean }> = {};
      (profiles || []).forEach((p) => { profileMap[p.id] = p; });

      // Group latest message per conversation partner
      const latestPerUser: Record<string, { content: string; created_at: string; sender_id: string; read_at?: string | null }> = {};
      (messages || []).forEach((m) => {
        const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        if (!otherIds.includes(otherId)) return;
        if (!latestPerUser[otherId]) latestPerUser[otherId] = m;
      });

      // Determine online status: present or seen within 15 minutes
      const fifteenMinsAgo = Date.now() - 900_000;

      const convos: Conversation[] = otherIds
        .map((id) => {
          const profile = profileMap[id];
          const latest = latestPerUser[id];
          const lastSeen = profile?.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0;
          return {
            userId: id,
            fullName: profile?.full_name || 'Unknown',
            profession: profile?.profession || '',
            avatarUrl: profile?.avatar_url || '',
            lastMessage: latest?.content || '',
            lastMessageAt: latest?.created_at || '',
            isUnread: latest ? (latest.sender_id !== user.id && !latest.read_at) : false,
            isOnline: profile?.is_present || lastSeen > fifteenMinsAgo,
          };
        })
        .sort((a, b) => {
          if (!a.lastMessageAt) return 1;
          if (!b.lastMessageAt) return -1;
          return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
        });

      setConversations(convos);
      setLoading(false);
    };

    fetchConversations();

    // Refresh on new messages
    const channel = supabase
      .channel('conversations-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${user.id}` }, () => {
        fetchConversations();
      })
      .subscribe();

    // Refresh when app comes back to foreground
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchConversations();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, isDemo]);

  const q = searchQuery.toLowerCase().trim();
  const filteredConversations = q
    ? conversations.filter(c => c.fullName.toLowerCase().includes(q))
    : conversations;

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-warm)] pb-24">
        <div className="max-w-lg mx-auto px-6 pt-8">
          <div className="skeleton h-8 w-40 mb-2" />
          <div className="skeleton h-4 w-28 mb-8" />
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3.5 p-4 mb-1" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="skeleton w-13 h-13 rounded-full flex-shrink-0" style={{ width: 52, height: 52 }} />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between">
                  <div className="skeleton h-4 w-28" />
                  <div className="skeleton h-3 w-10" />
                </div>
                <div className="skeleton h-3 w-44" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] pb-24">
      <div className="max-w-lg mx-auto px-6 pt-8">
        <header className="mb-6">
          <h2 className="font-serif text-3xl text-[var(--color-text-header)] mb-1">Messages</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {conversations.length > 0
              ? `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`
              : 'Your conversations'
            }
          </p>
        </header>

        {/* Search */}
        {conversations.length > 3 && (
          <div className="relative mb-5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="input-field pl-10 py-2.5 text-sm"
              aria-label="Search conversations"
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

        {/* Unread summary */}
        {conversations.filter(c => c.isUnread).length > 0 && (
          <div className="mb-4 bg-[var(--color-primary)]/6 border border-[var(--color-primary)]/15 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-gentle-pulse flex-shrink-0" />
            <p className="text-[13px] font-medium text-[var(--color-primary)]">
              {conversations.filter(c => c.isUnread).length} unread conversation{conversations.filter(c => c.isUnread).length !== 1 ? 's' : ''}
            </p>
          </div>
        )}

        {conversations.length === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-[var(--color-primary)]/8 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 className="font-serif text-xl text-[var(--color-text-header)] mb-2">No conversations yet</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6 max-w-[280px] mx-auto leading-relaxed">
              Connect with someone on the radar and start a conversation. Great things start with "hello."
            </p>
            <Link to="/radar" className="btn-primary inline-block px-8 py-3 text-xs">Open Radar</Link>
          </motion.div>
        ) : filteredConversations.length === 0 && q ? (
          <div className="card p-8 text-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-60">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <p className="text-sm text-[var(--color-text-secondary)]">No conversations matching "{searchQuery}"</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredConversations.map((conv, i) => (
              <motion.div
                key={conv.userId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link
                  to={`/chat/${conv.userId}`}
                  className="card card-interactive flex items-center gap-3.5 p-4"
                >
                  {/* Avatar with online dot */}
                  <div className="relative flex-shrink-0">
                    <div className="w-13 h-13 rounded-full overflow-hidden" style={{ width: 52, height: 52 }}>
                      {conv.avatarUrl ? (
                        <img src={conv.avatarUrl} alt={conv.fullName} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[var(--color-primary)] flex items-center justify-center text-white font-serif text-lg">
                          {conv.fullName.charAt(0)}
                        </div>
                      )}
                    </div>
                    {conv.isOnline && (
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[var(--color-success)] rounded-full border-2 border-[var(--color-bg-warm)]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <h4 className={`font-serif text-[15px] truncate ${conv.isUnread ? 'text-[var(--color-text-header)] font-semibold' : 'text-[var(--color-text-header)]'}`}>
                        {conv.fullName}
                      </h4>
                      {conv.lastMessageAt && (
                        <span className={`text-[11px] flex-shrink-0 ${conv.isUnread ? 'text-[var(--color-primary)] font-semibold' : 'text-[var(--color-steel-light)]'}`}>
                          {timeAgo(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    {conv.lastMessage ? (
                      <p className={`text-[13px] truncate ${conv.isUnread ? 'text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-secondary)]'}`}>
                        {conv.lastMessage}
                      </p>
                    ) : (
                      <p className="text-[13px] text-[var(--color-steel-light)] italic">No messages yet — say hello</p>
                    )}
                  </div>

                  {/* Unread dot */}
                  {conv.isUnread && (
                    <div className="w-2.5 h-2.5 bg-[var(--color-primary)] rounded-full flex-shrink-0 animate-gentle-pulse" />
                  )}
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
