import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { MOCK_USERS, getDemoProfile, isConnectedInDemo, addDemoConnection } from '../services/mockData';

interface Profile {
  id: string;
  full_name: string;
  interests: string[];
  profession?: string;
  company?: string;
}

interface ConnectionStatus {
  [userId: string]: 'none' | 'pending_sent' | 'pending_received' | 'accepted';
}

export default function CampusRadarPage() {
  const { user, isDemo } = useAuth();
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [matches, setMatches] = useState<(Profile & { overlap: string[] })[]>([]);
  const [connectionStatuses, setConnectionStatuses] = useState<ConnectionStatus>({});
  const [loading, setLoading] = useState(true);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);

      if (isDemo) {
        const me = getDemoProfile();
        const others = MOCK_USERS;
        setUserProfile(me as any);

        const myInterests = new Set(me.interests.map((i) => i.toLowerCase()));
        const withOverlap = others
          .map((p) => {
            const overlap = (p.interests || []).filter((i) =>
              myInterests.has(i.toLowerCase())
            );
            return { ...p, overlap };
          })
          .filter((p) => p.overlap.length > 0)
          .sort((a, b) => b.overlap.length - a.overlap.length);

        setMatches(withOverlap as any);

        const statuses: ConnectionStatus = {};
        others.forEach((p) => {
          statuses[p.id] = isConnectedInDemo(p.id);
        });
        setConnectionStatuses(statuses);
        setLoading(false);
        return;
      }

      // Fetch all profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, interests, profession, company');

      if (!profiles) {
        setLoading(false);
        return;
      }

      const me = profiles.find((p) => p.id === user.id);
      const others = profiles.filter((p) => p.id !== user.id);
      setUserProfile(me || null);

      if (!me?.interests) {
        setLoading(false);
        return;
      }

      // Compute overlap and sort
      const myInterests = new Set(me.interests.map((i) => i.toLowerCase()));
      const withOverlap = others
        .map((p) => {
          const overlap = (p.interests || []).filter((i) =>
            myInterests.has(i.toLowerCase())
          );
          return { ...p, overlap };
        })
        .filter((p) => p.overlap.length > 0)
        .sort((a, b) => b.overlap.length - a.overlap.length);

      setMatches(withOverlap);

      // Fetch connection statuses
      const { data: connections } = await supabase
        .from('connections')
        .select('*')
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

      const statuses: ConnectionStatus = {};
      (connections || []).forEach((c: any) => {
        const otherId = c.requester_id === user.id ? c.recipient_id : c.requester_id;
        if (c.status === 'accepted') {
          statuses[otherId] = 'accepted';
        } else if (c.status === 'pending') {
          statuses[otherId] = c.requester_id === user.id ? 'pending_sent' : 'pending_received';
        }
      });
      setConnectionStatuses(statuses);
      setLoading(false);
    };

    fetchData();

    // Listen for realtime profile changes
    const channel = supabase
      .channel('radar-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const sendConnectionRequest = async (recipientId: string) => {
    setSendingTo(recipientId);

    if (isDemo) {
      addDemoConnection(recipientId);
      setConnectionStatuses((prev) => ({ ...prev, [recipientId]: 'pending_sent' }));
      setSendingTo(null);
      return;
    }

    if (!user) return;

    const { error } = await supabase.from('connections').insert({
      requester_id: user.id,
      recipient_id: recipientId,
    });

    if (!error) {
      setConnectionStatuses((prev) => ({ ...prev, [recipientId]: 'pending_sent' }));
    }
    setSendingTo(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[--color-bg-warm] p-8 flex items-center justify-center">
        <div className="animate-pulse font-brand text-xl text-[--color-primary]">Scanning for matches...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[--color-bg-warm] p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8 text-center">
          <h2 className="text-3xl font-brand font-bold text-[--color-primary] mb-2 uppercase tracking-tight">
            Radar
          </h2>
          <p className="text-[--color-steel] opacity-70">
            People with overlapping interests
          </p>
        </header>

        {userProfile?.interests && (
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {userProfile.interests.map((interest) => (
              <span
                key={interest}
                className="bg-[--color-bg-warm] text-[--color-primary] text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider border border-[--color-mist]"
              >
                {interest}
              </span>
            ))}
          </div>
        )}

        {matches.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[--color-mist] text-center">
            <p className="text-[--color-steel] text-lg">No matches yet.</p>
            <p className="text-[--color-steel] opacity-60 text-sm mt-2">
              When others with similar interests join, they'll appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map((match) => {
              const status = connectionStatuses[match.id] || 'none';
              return (
                <div
                  key={match.id}
                  className="bg-white border border-[--color-mist] p-5 rounded-2xl shadow-sm hover-lift animate-fade-in"
                >
                  <div className="flex items-start space-x-4">
                    <div className="w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center text-white font-brand text-xl bg-[--color-primary]">
                      {match.full_name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-grow">
                      <div className="flex justify-between items-center mb-1">
                        <div>
                          <h4 className="text-lg font-brand font-bold text-[--color-text-primary]">
                            {match.full_name}
                          </h4>
                          {(match.profession || match.company) && (
                            <p className="text-xs text-[--color-steel] opacity-70">
                              {match.profession}{match.profession && match.company ? ' • ' : ''}{match.company}
                            </p>
                          )}
                        </div>
                        <div className="bg-[--color-cream] px-3 py-1 rounded-lg border border-[--color-mist]">
                          <span className="text-sm font-bold text-[--color-primary]">
                            {Math.round((match.overlap.length / (userProfile?.interests?.length || 1)) * 100)}%
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {match.overlap.slice(0, 3).map((interest) => (
                          <span
                            key={interest}
                            className="text-[10px] uppercase tracking-wider bg-[--color-primary] text-white px-2 py-0.5 rounded-md font-bold"
                          >
                            {interest}
                          </span>
                        ))}
                        {match.overlap.length > 3 && (
                          <span className="text-[10px] text-[--color-steel] opacity-50 font-bold self-center">
                            +{match.overlap.length - 3} MORE
                          </span>
                        )}
                      </div>

                      <div className="mt-4 flex justify-end">
                        {status === 'accepted' && (
                          <Link
                            to={`/chat/${match.id}`}
                            className="bg-green-600 text-white px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-green-700 transition-all"
                          >
                            Message
                          </Link>
                        )}
                        {status === 'pending_sent' && (
                          <span className="bg-[--color-bg-warm] text-[--color-steel] px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest opacity-60">
                            Pending
                          </span>
                        )}
                        {status === 'pending_received' && (
                          <Link
                            to="/connections"
                            className="bg-[--color-accent] text-white px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-opacity-90 transition-all"
                          >
                            Respond
                          </Link>
                        )}
                        {status === 'none' && (
                          <button
                            onClick={() => sendConnectionRequest(match.id)}
                            disabled={sendingTo === match.id}
                            className="bg-[--color-primary] text-white px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-opacity-90 transition-all disabled:opacity-50"
                          >
                            {sendingTo === match.id ? 'Sending...' : 'Connect'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
