import React, { useState, useEffect, useRef } from 'react';
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

export default function ChatPage() {
  const { userId } = useParams();
  const { user, isDemo } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [recipientName, setRecipientName] = useState('Connection');
  const [recipientProfession, setRecipientProfession] = useState('');
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
        .select('full_name, profession')
        .eq('id', userId)
        .single();
      if (profile) {
        setRecipientName(profile.full_name);
        setRecipientProfession(profile.profession || '');
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId) return;

    if (isDemo) {
      const newMsg = addDemoMessage(userId, newMessage.trim());
      setMessages((prev) => [...prev, newMsg as Message]);
      setNewMessage('');
      return;
    }

    if (!user) return;

    const { data, error } = await supabase
      .from('messages')
      .insert([{ sender_id: user.id, recipient_id: userId, content: newMessage.trim() }])
      .select()
      .single();

    if (!error && data) {
      setMessages((prev) => [...prev, data]);
      setNewMessage('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[--color-bg-warm] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-[--color-primary] border-t-transparent animate-spin mx-auto mb-4" />
          <p className="section-label">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[--color-bg-warm] flex items-center justify-center px-6">
        <div className="card p-10 text-center max-w-sm w-full">
          <div className="w-14 h-14 bg-[--color-primary]/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </div>
          <h3 className="font-serif text-xl text-[--color-text-header] mb-2">Not Connected</h3>
          <p className="text-sm text-[--color-text-secondary] mb-6">Connect with this person on the radar first.</p>
          <button onClick={() => navigate('/radar')} className="btn-primary w-full py-3.5 text-xs">
            Back to Radar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[--color-bg-warm]">
      {/* Header */}
      <header className="flex-shrink-0 glass-effect border-b border-[--color-sand]/60 px-4 py-3 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate('/connections')}
            className="w-9 h-9 flex items-center justify-center text-[--color-steel-light] hover:text-[--color-text-primary] transition-colors rounded-lg"
            aria-label="Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div className="w-10 h-10 rounded-xl bg-[--color-primary] flex items-center justify-center text-white font-serif text-lg flex-shrink-0">
            {recipientName.charAt(0)}
          </div>
          <div className="min-w-0">
            <h3 className="font-serif text-[--color-text-header] text-base truncate">{recipientName}</h3>
            <p className="text-[12px] text-[--color-text-secondary] truncate">{recipientProfession || 'Connected'}</p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 content-container">
        <div className="max-w-lg mx-auto space-y-3">
          <AnimatePresence initial={false}>
            {messages.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
                <div className="w-14 h-14 bg-[--color-sand-light] rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-steel-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                </div>
                <p className="text-sm text-[--color-text-secondary]">Start the conversation</p>
              </motion.div>
            )}
            {messages.map((msg) => {
              const isMine = msg.sender_id === user?.id;
              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] px-4 py-3 text-[15px] leading-relaxed ${
                    isMine
                      ? 'bg-[--color-primary] text-white rounded-2xl rounded-br-md'
                      : 'bg-white text-[--color-text-primary] border border-[--color-sand] rounded-2xl rounded-bl-md'
                  }`}>
                    {msg.content}
                    <p className={`text-[10px] mt-1.5 opacity-50 ${isMine ? 'text-right' : 'text-left'}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 glass-effect border-t border-[--color-sand]/60 px-4 py-3 safe-bottom">
        <form onSubmit={handleSendMessage} className="max-w-lg mx-auto flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="input-field flex-1 !rounded-full !py-3"
            aria-label="Message"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="w-11 h-11 bg-[--color-primary] text-white rounded-full flex items-center justify-center flex-shrink-0 hover:bg-[--color-primary-dark] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" /></svg>
          </button>
        </form>
      </div>
    </div>
  );
}
