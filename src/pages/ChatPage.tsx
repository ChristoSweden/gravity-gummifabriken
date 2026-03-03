import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase, isDemoMode } from '../services/supabaseService';
import { MOCK_USERS, getDemoProfile, getDemoMessages, addDemoMessage, isConnectedInDemo } from '../services/mockData';

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
}

export default function ChatPage() {
  const { userId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [recipientName, setRecipientName] = useState('Connection');
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !userId) return;

    const init = async () => {
      setLoading(true);

      if (isDemoMode()) {
        const connected = isConnectedInDemo(userId);

        if (connected !== 'accepted') {
          setAuthorized(false);
          setLoading(false);
          return;
        }

        setAuthorized(true);
        const profile = MOCK_USERS.find(p => p.id === userId);
        if (profile) setRecipientName(profile.full_name);

        const msgs = getDemoMessages(userId);
        setMessages(msgs as any);
        setLoading(false);
        return;
      }

      // Check that users are connected
      const { data: connection } = await supabase
        .from('connections')
        .select('id')
        .eq('status', 'accepted')
        .or(
          `and(requester_id.eq.${user.id},recipient_id.eq.${userId}),and(requester_id.eq.${userId},recipient_id.eq.${user.id})`
        )
        .single();

      if (!connection) {
        setAuthorized(false);
        setLoading(false);
        return;
      }

      setAuthorized(true);

      // Fetch recipient name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();
      if (profile) setRecipientName(profile.full_name);

      // Fetch messages
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`
        )
        .order('created_at', { ascending: true });

      if (msgs) setMessages(msgs);
      setLoading(false);
    };

    init();

    const channel = supabase
      .channel(`chat:${user.id}:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new.sender_id === userId) {
            setMessages((prev) => [...prev, payload.new as Message]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, userId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId) return;

    if (isDemoMode()) {
      const newMsg = addDemoMessage(userId, newMessage.trim());
      setMessages((prev) => [...prev, newMsg as any]);
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
      <div className="min-h-screen bg-[--color-bg-warm] p-8 flex items-center justify-center">
        <div className="animate-pulse font-brand text-xl text-[--color-primary]">Loading chat...</div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[--color-bg-warm] p-8 flex items-center justify-center">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-md">
          <h3 className="font-brand text-xl text-[--color-primary] mb-4">Not Connected</h3>
          <p className="text-[--color-steel] mb-6">You need to be connected with this person before you can message them.</p>
          <button
            onClick={() => navigate('/radar')}
            className="bg-[--color-primary] text-white px-6 py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all"
          >
            Back to Radar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[--color-bg-warm]">
      <header className="p-4 bg-white border-b border-[--color-mist] flex items-center">
        <Link to="/connections" className="mr-4 text-[--color-primary]">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h3 className="font-brand font-bold text-[--color-primary] uppercase tracking-tight">{recipientName}</h3>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-[--color-steel] opacity-50 mt-8">
            <p>No messages yet. Say hello!</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] p-3 rounded-2xl shadow-sm text-sm ${msg.sender_id === user?.id
                ? 'bg-[--color-primary] text-white rounded-tr-none'
                : 'bg-white text-[--color-steel] border border-[--color-mist] rounded-tl-none'
                }`}
            >
              {msg.content}
              <p className={`text-[8px] mt-1 opacity-50 ${msg.sender_id === user?.id ? 'text-right' : 'text-left'}`}>
                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-[--color-mist] flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 p-3 bg-[--color-bg-warm] border-none rounded-xl focus:ring-2 focus:ring-[--color-primary] text-sm"
        />
        <button
          type="submit"
          className="bg-[--color-primary] text-white p-3 rounded-xl hover:bg-opacity-90 transition-all font-bold uppercase text-[10px] tracking-widest"
        >
          Send
        </button>
      </form>
    </div>
  );
}
