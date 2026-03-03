import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { MOCK_USERS, getDemoProfile, getDemoConnections, acceptDemoConnection, declineDemoConnection } from '../services/mockData';

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
}

export default function ConnectionsPage() {
  const { user, isDemo } = useAuth();
  const [pendingRequests, setPendingRequests] = useState<(Connection & { profile: Profile })[]>([]);
  const [accepted, setAccepted] = useState<(Connection & { profile: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchConnections = async () => {
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

        if (c.status === 'pending' && c.recipient_id === getDemoProfile().id) {
          pending.push({ ...c, profile });
        } else if (c.status === 'accepted') {
          acc.push({ ...c, profile });
        }
      });

      setPendingRequests(pending);
      setAccepted(acc);
      setLoading(false);
      return;
    }

    // Fetch all connections involving current user
    const { data: connections } = await supabase
      .from('connections')
      .select('*')
      .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (!connections) {
      setLoading(false);
      return;
    }

    // Get all other user IDs
    const otherIds = connections.map((c) =>
      c.requester_id === user.id ? c.recipient_id : c.requester_id
    );

    // Fetch profiles for those users
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, interests')
      .in('id', otherIds);

    const profileMap: Record<string, Profile> = {};
    (profiles || []).forEach((p: Profile) => {
      profileMap[p.id] = p;
    });

    // Split into pending (where I'm recipient) and accepted
    const pending: (Connection & { profile: Profile })[] = [];
    const acc: (Connection & { profile: Profile })[] = [];

    connections.forEach((c) => {
      const otherId = c.requester_id === user.id ? c.recipient_id : c.requester_id;
      const profile = profileMap[otherId];
      if (!profile) return;

      if (c.status === 'pending' && c.recipient_id === user.id) {
        pending.push({ ...c, profile });
      } else if (c.status === 'accepted') {
        acc.push({ ...c, profile });
      }
    });

    setPendingRequests(pending);
    setAccepted(acc);
    setLoading(false);
  };

  useEffect(() => {
    fetchConnections();

    if (!user) return;

    const channel = supabase
      .channel('connections-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, () => {
        fetchConnections();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleAccept = async (connectionId: string) => {
    setUpdatingId(connectionId);
    if (isDemo) {
      acceptDemoConnection(connectionId);
      await fetchConnections();
      setUpdatingId(null);
      return;
    }
    await supabase
      .from('connections')
      .update({ status: 'accepted' })
      .eq('id', connectionId);
    await fetchConnections();
    setUpdatingId(null);
  };

  const handleDecline = async (connectionId: string) => {
    setUpdatingId(connectionId);
    if (isDemo) {
      declineDemoConnection(connectionId);
      await fetchConnections();
      setUpdatingId(null);
      return;
    }
    await supabase
      .from('connections')
      .delete()
      .eq('id', connectionId);
    await fetchConnections();
    setUpdatingId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[--color-bg-warm] p-8 flex items-center justify-center">
        <div className="animate-pulse font-brand text-xl text-[--color-primary]">Loading connections...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[--color-bg-warm] p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8 text-center">
          <h2 className="text-3xl font-brand font-bold text-[--color-primary] mb-2 uppercase tracking-tight">
            Connections
          </h2>
        </header>

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-bold uppercase tracking-widest text-[--color-steel] opacity-60 mb-4">
              Pending Requests
            </h3>
            <div className="space-y-3">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white border border-[--color-mist] p-4 rounded-2xl shadow-sm animate-fade-in flex items-center space-x-4"
                >
                  <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-white font-brand text-lg bg-[--color-accent]">
                    {req.profile.full_name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-brand font-bold">{req.profile.full_name}</h4>
                    <p className="text-xs text-[--color-steel] opacity-60">
                      {(req.profile.interests || []).slice(0, 3).join(', ')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(req.id)}
                      disabled={updatingId === req.id}
                      className="bg-green-600 text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-green-700 transition-all disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleDecline(req.id)}
                      disabled={updatingId === req.id}
                      className="bg-white text-[--color-steel] border border-[--color-mist] px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accepted Connections */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-[--color-steel] opacity-60 mb-4">
            {accepted.length > 0 ? 'Your Connections' : ''}
          </h3>

          {accepted.length === 0 && pendingRequests.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-[--color-mist] text-center">
              <p className="text-[--color-steel] text-lg">No connections yet.</p>
              <p className="text-[--color-steel] opacity-60 text-sm mt-2">
                Head to the Radar to find people with shared interests.
              </p>
              <Link
                to="/radar"
                className="inline-block mt-4 bg-[--color-primary] text-white px-6 py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all"
              >
                Open Radar
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {accepted.map((conn) => (
                <div
                  key={conn.id}
                  className="bg-white border border-[--color-mist] p-4 rounded-2xl shadow-sm hover-lift animate-fade-in flex items-center space-x-4"
                >
                  <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-white font-brand text-lg bg-[--color-primary]">
                    {conn.profile.full_name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-brand font-bold">{conn.profile.full_name}</h4>
                    <p className="text-xs text-[--color-steel] opacity-60">
                      {(conn.profile.interests || []).slice(0, 3).join(', ')}
                    </p>
                  </div>
                  <Link
                    to={`/chat/${conn.profile.id}`}
                    className="bg-[--color-primary] text-white px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-opacity-90 transition-all"
                  >
                    Message
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
