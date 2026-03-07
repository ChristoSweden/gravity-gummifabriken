import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { MOCK_USERS, getDemoMessages, addDemoMessage, isConnectedInDemo } from '../services/mockData';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at?: string | null;
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

export default function ChatPage() {
  const { userId } = useParams();
  const { user, isDemo } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientProfession, setRecipientProfession] = useState('');
  const [recipientAvatar, setRecipientAvatar] = useState('');
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user || !userId) return;

    const init = async () => {
      setLoading(true);

      if (isDemo) {
        const connected = isConnectedInDemo(userId);
        if (connected !== 'accepted') { setAuthorized(false); setLoading(false); return; }
        setAuthorized(true);
        const profile = MOCK_USERS.find((p) => p.id === userId);
        if (profile) {
          setRecipientName(profile.full_name);
          setRecipientProfession(profile.profession || '');
          setRecipientAvatar(profile.avatar_url || '');
        }
        setMessages(getDemoMessages(userId) as Message[]);
        setLoading(false);
        return;
      }

      const { data: connection, error: connErr } = await supabase
        .from('connections')
        .select('id')
        .eq('status', 'accepted')
        .or(`and(requester_id.eq.${user.id},recipient_id.eq.${userId}),and(requester_id.eq.${userId},recipient_id.eq.${user.id})`)
        .maybeSingle();

      if (connErr || !connection) { setAuthorized(false); setLoading(false); return; }
      setAuthorized(true);

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, profession, avatar_url')
        .eq('id', userId)
        .single();

      if (profile) {
        setRecipientName(profile.full_name);
        setRecipientProfession(profile.profession || '');
        setRecipientAvatar(profile.avatar_url || '');
      }

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      if (msgs) setMessages(msgs);
      setLoading(false);
    };

    init();

    const channel = supabase
      .channel(`chat:${user.id}:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${user.id}` }, (payload) => {
        if (payload.new.sender_id === userId) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === (payload.new as Message).id)) return prev;
            return [...prev, payload.new as Message];
          });
          // Auto-mark as read since chat is open
          if (!isDemo) {
            supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', payload.new.id).then();
          }
        }
      })
      // Listen for read receipt updates on our sent messages
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender_id=eq.${user.id}` }, (payload) => {
        if (payload.new.read_at) {
          setMessages((prev) => prev.map((m) => m.id === payload.new.id ? { ...m, read_at: payload.new.read_at } : m));
        }
      })
      .subscribe();

    // Typing indicator channel (presence-based)
    const typingChannel = supabase.channel(`typing:${[user.id, userId].sort().join(':')}`, {
      config: { presence: { key: user.id } },
    });
    typingChannel
      .on('presence', { event: 'sync' }, () => {
        const state = typingChannel.presenceState();
        // Check if the OTHER user is typing
        const otherPresence = state[userId];
        setIsTyping(!!otherPresence && otherPresence.some((p: any) => p.typing));
      })
      .subscribe();
    typingChannelRef.current = typingChannel;

    // Mark messages as read when opening chat
    if (!isDemo) {
      supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('sender_id', userId)
        .eq('recipient_id', user.id)
        .is('read_at', null)
        .then();
    }

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
    };
  }, [user, userId, isDemo]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const broadcastTyping = useCallback((typing: boolean) => {
    if (isDemo || !typingChannelRef.current) return;
    typingChannelRef.current.track({ typing });
  }, [isDemo]);

  const handleTyping = useCallback(() => {
    broadcastTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => broadcastTyping(false), 2000);
  }, [broadcastTyping]);

  const adjustTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, []);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !userId) return;

    if (isDemo) {
      const newMsg = addDemoMessage(userId, newMessage.trim());
      setMessages((prev) => [...prev, newMsg as Message]);
      setNewMessage('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    if (!user) return;
    broadcastTyping(false);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    const content = newMessage.trim();
    // Optimistic: show message immediately with a temporary ID
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      sender_id: user.id,
      recipient_id: userId,
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setNewMessage('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const { data, error } = await supabase
      .from('messages')
      .insert([{ sender_id: user.id, recipient_id: userId, content }])
      .select()
      .single();

    if (error) {
      // Remove the optimistic message and restore the text
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(content);
      setSendError('Message failed to send. Please try again.');
      setTimeout(() => setSendError(null), 4000);
    } else if (data) {
      // Replace optimistic message with real one
      setMessages((prev) => prev.map((m) => m.id === tempId ? data : m));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleBlock = async () => {
    if (!user || !userId || isDemo) return;
    if (!window.confirm(`Block ${recipientName}? They won't be able to message you or see your profile.`)) return;
    await supabase.from('blocked_users').upsert({ blocker_id: user.id, blocked_id: userId });
    // Remove the connection
    await supabase.from('connections').delete()
      .or(`and(requester_id.eq.${user.id},recipient_id.eq.${userId}),and(requester_id.eq.${userId},recipient_id.eq.${user.id})`);
    setShowMenu(false);
    navigate('/chat');
  };

  const handleReport = async () => {
    if (!user || !userId || !reportReason) return;
    await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_id: userId,
      reason: reportReason,
      details: reportDetails || null,
    });
    setReportSent(true);
    setTimeout(() => { setShowReportModal(false); setReportSent(false); setReportReason(''); setReportDetails(''); }, 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-warm)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="section-label">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-warm)] flex items-center justify-center px-6">
        <div className="card p-10 text-center max-w-sm w-full">
          <div className="w-14 h-14 bg-[var(--color-primary)]/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </div>
          <h3 className="font-serif text-xl text-[var(--color-text-header)] mb-2">Not Connected</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">Connect with this person on the radar first.</p>
          <button onClick={() => navigate('/radar')} className="btn-primary w-full py-3.5 text-xs">Back to Radar</button>
        </div>
      </div>
    );
  }

  // Group messages by date for day separators
  const messageGroups: { date: string; messages: Message[] }[] = [];
  messages.forEach((msg) => {
    const label = getDateLabel(msg.created_at);
    const last = messageGroups[messageGroups.length - 1];
    if (last && last.date === label) {
      last.messages.push(msg);
    } else {
      messageGroups.push({ date: label, messages: [msg] });
    }
  });

  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg-warm)]" style={{ height: '100dvh' }}>

      {/* ── Header ── */}
      <header className="flex-shrink-0 glass-effect border-b border-[var(--color-sand)]/60 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/chat')}
            className="w-9 h-9 flex items-center justify-center text-[var(--color-steel-light)] hover:text-[var(--color-text-primary)] transition-colors rounded-lg flex-shrink-0"
            aria-label="Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>

          {/* Avatar */}
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
            {recipientAvatar ? (
              <img src={recipientAvatar} alt={recipientName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[var(--color-primary)] flex items-center justify-center text-white font-serif text-lg">
                {recipientName.charAt(0)}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-[var(--color-text-header)] text-base leading-tight truncate">{recipientName}</h3>
            {recipientProfession && !isTyping && (
              <p className="text-[11px] text-[var(--color-text-secondary)] truncate">{recipientProfession}</p>
            )}
            {isTyping && (
              <p className="text-[11px] text-[var(--color-primary)] truncate">typing...</p>
            )}
          </div>

          {/* More menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-9 h-9 flex items-center justify-center text-[var(--color-steel-light)] hover:text-[var(--color-text-primary)] transition-colors rounded-lg"
              aria-label="More options"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            <AnimatePresence>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    className="absolute right-0 top-full mt-1 bg-[var(--color-bg-card)] border border-[var(--color-sand)] rounded-xl shadow-lg z-50 overflow-hidden min-w-[160px]"
                  >
                    <button
                      onClick={() => { setShowMenu(false); setShowReportModal(true); }}
                      className="w-full px-4 py-3 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-mist)] transition-colors flex items-center gap-2.5"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                      Report
                    </button>
                    <button
                      onClick={handleBlock}
                      className="w-full px-4 py-3 text-left text-sm text-[var(--color-error)] hover:bg-[var(--color-error)]/5 transition-colors flex items-center gap-2.5"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/></svg>
                      Block User
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 content-container">
        <div className="max-w-lg mx-auto">
          <AnimatePresence initial={false}>
            {messages.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full py-24 gap-3">
                <div className="w-14 h-14 rounded-full overflow-hidden">
                  {recipientAvatar ? (
                    <img src={recipientAvatar} alt={recipientName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[var(--color-primary)] flex items-center justify-center text-white font-serif text-2xl">
                      {recipientName.charAt(0)}
                    </div>
                  )}
                </div>
                <p className="font-serif text-lg text-[var(--color-text-header)]">{recipientName}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Start the conversation</p>
              </motion.div>
            )}
          </AnimatePresence>

          {messageGroups.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-[var(--color-sand)]" />
                <span className="text-[11px] font-semibold text-[var(--color-steel-light)] uppercase tracking-wider">{group.date}</span>
                <div className="flex-1 h-px bg-[var(--color-sand)]" />
              </div>

              {/* Messages */}
              {group.messages.map((msg, idx) => {
                const isMine = msg.sender_id === user?.id;
                const prev = group.messages[idx - 1];
                const next = group.messages[idx + 1];
                const sameSenderAsPrev = prev?.sender_id === msg.sender_id;
                const sameSenderAsNext = next?.sender_id === msg.sender_id;

                // iMessage-style corner rounding
                const myRadius = sameSenderAsNext ? 'rounded-2xl rounded-br-md' : 'rounded-2xl';
                const theirRadius = sameSenderAsNext ? 'rounded-2xl rounded-bl-md' : 'rounded-2xl';

                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={msg.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${sameSenderAsPrev ? 'mt-0.5' : 'mt-3'}`}
                  >
                    {/* Received: show avatar for first message in a run */}
                    {!isMine && !sameSenderAsPrev && (
                      <div className="w-7 h-7 rounded-full overflow-hidden mr-2 self-end flex-shrink-0">
                        {recipientAvatar ? (
                          <img src={recipientAvatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-[var(--color-primary)] flex items-center justify-center text-white text-[10px] font-bold">
                            {recipientName.charAt(0)}
                          </div>
                        )}
                      </div>
                    )}
                    {!isMine && sameSenderAsPrev && <div className="w-7 mr-2 flex-shrink-0" />}

                    <div className={`max-w-[72%] group`}>
                      <div className={`px-4 py-2.5 text-[15px] leading-relaxed ${
                        isMine
                          ? `bg-[var(--color-primary)] text-white ${myRadius}`
                          : `bg-[var(--color-bg-card)] text-[var(--color-text-primary)] border border-[var(--color-sand)] ${theirRadius}`
                      }`}>
                        {msg.content}
                      </div>
                      {/* Timestamp + read receipt — shown below last message in a run */}
                      {!sameSenderAsNext && (
                        <p className={`text-[10px] mt-1 text-[var(--color-steel-light)] flex items-center gap-1 ${isMine ? 'justify-end pr-1' : 'justify-start pl-1'}`}>
                          <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {isMine && (
                            <svg width="14" height="10" viewBox="0 0 16 10" fill="none" stroke={msg.read_at ? 'var(--color-primary)' : 'var(--color-steel-light)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 5.5l3 3L10 2" />
                              <path d="M5 5.5l3 3L14 2" />
                            </svg>
                          )}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ))}
          {/* Typing indicator */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="flex items-center gap-2 mt-3 ml-9"
              >
                <div className="bg-[var(--color-bg-card)] border border-[var(--color-sand)] rounded-2xl px-4 py-2.5 flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 bg-[var(--color-steel-light)] rounded-full"
                      style={{ animation: `gentlePulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={scrollRef} className="h-2" />
        </div>
      </div>

      {/* ── Send error toast ── */}
      <AnimatePresence>
        {sendError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-24 left-4 right-4 mx-auto max-w-lg bg-[var(--color-error)]/95 text-white text-sm text-center px-4 py-2.5 rounded-xl shadow-lg z-10"
          >
            {sendError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Report modal ── */}
      <AnimatePresence>
        {showReportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center"
            onClick={() => setShowReportModal(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="bg-[var(--color-bg-warm)] w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-xl border border-[var(--color-sand)]/50"
              onClick={(e) => e.stopPropagation()}
            >
              {reportSent ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-[var(--color-success)]/12 flex items-center justify-center mx-auto mb-4">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  </div>
                  <h3 className="font-serif text-lg text-[var(--color-text-header)]">Report Submitted</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-1">We'll review this promptly.</p>
                </div>
              ) : (
                <>
                  <h3 className="font-serif text-xl text-[var(--color-text-header)] mb-1">Report {recipientName}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] mb-5">What's the issue?</p>
                  <div className="space-y-2 mb-4">
                    {['Harassment', 'Spam', 'Inappropriate content', 'Fake profile', 'Other'].map((reason) => (
                      <button
                        key={reason}
                        onClick={() => setReportReason(reason)}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors border ${
                          reportReason === reason
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)] font-medium'
                            : 'border-[var(--color-sand)] text-[var(--color-text-primary)] hover:bg-[var(--color-mist)]'
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="input-field min-h-[70px] resize-none mb-4"
                    placeholder="Additional details (optional)"
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                  />
                  <div className="flex gap-3">
                    <button onClick={() => setShowReportModal(false)} className="btn-secondary flex-1 py-3 text-xs">Cancel</button>
                    <button onClick={handleReport} disabled={!reportReason} className="btn-primary flex-1 py-3 text-xs disabled:opacity-40">Submit Report</button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input bar ── */}
      <div className="flex-shrink-0 bg-[var(--color-bg-warm)] border-t border-[var(--color-sand)]/60 px-4 py-3 safe-bottom">
        <div className="max-w-lg mx-auto flex items-end gap-2">
          <div className="flex-1 bg-[var(--color-bg-card)] border border-[var(--color-sand)] rounded-2xl px-4 py-2.5 focus-within:border-[var(--color-primary)] focus-within:shadow-[0_0_0_3px_rgba(184,115,51,0.08)] transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={newMessage}
              onChange={(e) => { if (e.target.value.length <= 5000) { setNewMessage(e.target.value); adjustTextarea(); handleTyping(); } }}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              className="w-full text-[15px] text-[var(--color-text-primary)] bg-transparent outline-none resize-none placeholder:text-[var(--color-steel-light)]/60 leading-relaxed"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
              maxLength={5000}
              aria-label="Message"
            />
          </div>
          <button
            onClick={() => handleSendMessage()}
            disabled={!newMessage.trim()}
            className="w-10 h-10 bg-[var(--color-primary)] text-white rounded-full flex items-center justify-center flex-shrink-0 hover:bg-[var(--color-primary-dark)] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-95 active:scale-95"
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
