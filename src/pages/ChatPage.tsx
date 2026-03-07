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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, userId, isDemo]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    const { data, error } = await supabase
      .from('messages')
      .insert([{ sender_id: user.id, recipient_id: userId, content: newMessage.trim() }])
      .select()
      .single();

    if (error) {
      setSendError('Message failed to send. Please try again.');
      setTimeout(() => setSendError(null), 4000);
    } else if (data) {
      setMessages((prev) => [...prev, data]);
      setNewMessage('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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
            {recipientProfession && (
              <p className="text-[11px] text-[var(--color-text-secondary)] truncate">{recipientProfession}</p>
            )}
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
                          : `bg-white text-[var(--color-text-primary)] border border-[var(--color-sand)] ${theirRadius}`
                      }`}>
                        {msg.content}
                      </div>
                      {/* Timestamp — shown below last message in a run */}
                      {!sameSenderAsNext && (
                        <p className={`text-[10px] mt-1 text-[var(--color-steel-light)] ${isMine ? 'text-right pr-1' : 'text-left pl-1'}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ))}
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

      {/* ── Input bar ── */}
      <div className="flex-shrink-0 bg-[var(--color-bg-warm)] border-t border-[var(--color-sand)]/60 px-4 py-3 safe-bottom">
        <div className="max-w-lg mx-auto flex items-end gap-2">
          <div className="flex-1 bg-white border border-[var(--color-sand)] rounded-2xl px-4 py-2.5 focus-within:border-[var(--color-primary)] focus-within:shadow-[0_0_0_3px_rgba(184,115,51,0.08)] transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={newMessage}
              onChange={(e) => { setNewMessage(e.target.value); adjustTextarea(); }}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              className="w-full text-[15px] text-[var(--color-text-primary)] bg-transparent outline-none resize-none placeholder:text-[var(--color-steel-light)]/60 leading-relaxed"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
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
