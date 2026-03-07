import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { MOCK_USERS, getDemoProfile, getDemoConnections, getDemoMessages } from '../services/mockData';
import { motion } from 'motion/react';

interface Conversation {
  userId: string;
  fullName: string;
  profession: string;
  avatarUrl: string;
  lastMessage: string;
  lastMessageAt: string;
  isUnread: boolean;
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

      // Fetch profiles and latest messages in parallel
      const [{ data: profiles }, { data: messages }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, profession, avatar_url').in('id', otherIds),
        supabase
          .from('messages')
          .select('sender_id, recipient_id, content, created_at, read_at')
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order('created_at', { ascending: false }),
      ]);

      const profileMap: Record<string, { full_name: string; profession: string; avatar_url: string }> = {};
      (profiles || []).forEach((p) => { profileMap[p.id] = p; });

      // Group latest message per conversation partner
      const latestPerUser: Record<string, { content: string; created_at: string; sender_id: string; read_at?: string | null }> = {};
      (messages || []).forEach((m) => {
        const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        if (!otherIds.includes(otherId)) return;
        if (!latestPerUser[otherId]) latestPerUser[otherId] = m;
      });

      const convos: Conversation[] = otherIds
        .map((id) => {
          const profile = profileMap[id];
          const latest = latestPerUser[id];
          return {
            userId: id,
            fullName: profile?.full_name || 'Unknown',
            profession: profile?.profession || '',
            avatarUrl: profile?.avatar_url || '',
            lastMessage: latest?.content || '',
            lastMessageAt: latest?.created_at || '',
            isUnread: latest ? (latest.sender_id !== user.id && !latest.read_at) : false,
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-warm)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="section-label">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] pb-24">
      <div className="max-w-lg mx-auto px-6 pt-8">
        <header className="mb-8">
          <h2 className="font-serif text-3xl text-[var(--color-text-header)] mb-1">Messages</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">Your conversations</p>
        </header>

        {conversations.length === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card p-12 text-center">
            <div className="w-16 h-16 bg-[var(--color-sand-light)] rounded-full flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 className="font-serif text-lg text-[var(--color-text-header)] mb-2">No conversations yet</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6 max-w-[260px] mx-auto">
              Connect with someone on the radar and start a conversation. Great things start with "hello."
            </p>
            <Link to="/radar" className="btn-primary inline-block px-8 py-3 text-xs">Open Radar</Link>
          </motion.div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv, i) => (
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
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                    {conv.avatarUrl ? (
                      <img src={conv.avatarUrl} alt={conv.fullName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[var(--color-primary)] flex items-center justify-center text-white font-serif text-lg">
                        {conv.fullName.charAt(0)}
                      </div>
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
                    <div className="w-2.5 h-2.5 bg-[var(--color-primary)] rounded-full flex-shrink-0" />
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
