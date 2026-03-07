import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabaseService';
import { APP_CONFIG } from '../config/appConfig';
import { motion } from 'motion/react';

interface InviteResult {
  email: string;
  status: 'sent' | 'error';
  message?: string;
}

interface Analytics {
  totalUsers: number;
  presentNow: number;
  totalConnections: number;
  pendingConnections: number;
  totalMessages: number;
  topInterests: { name: string; count: number }[];
  recentSignups: { id: string; full_name: string; created_at: string }[];
  activityByHour: { hour: number; connections: number; messages: number }[];
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`card p-5 text-center ${accent ? 'border-[var(--color-primary)]/20 bg-[var(--color-primary)]/3' : ''}`}>
      <p className="font-serif text-3xl text-[var(--color-text-header)] mb-1">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-secondary)]">{label}</p>
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'overview' | 'invite'>('overview');
  const [emailList, setEmailList] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<InviteResult[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  const isAdmin = APP_CONFIG.ADMIN_EMAILS.length > 0
    ? APP_CONFIG.ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '')
    : true;

  useEffect(() => {
    if (!isAdmin) return;
    fetchAnalytics();
  }, [isAdmin]);

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);

    const { data, error: rpcError } = await supabase.rpc('get_admin_analytics');

    if (rpcError || !data) {
      console.error('Admin analytics RPC failed:', rpcError);
      setLoadingAnalytics(false);
      return;
    }

    const raw = data as {
      total_users: number;
      present_now: number;
      total_connections: number;
      pending_connections: number;
      total_messages: number;
      top_interests: { name: string; count: number }[];
      recent_signups: { id: string; full_name: string; created_at: string }[];
      recent_connections: { created_at: string }[];
      recent_messages: { created_at: string }[];
    };

    // Activity by hour (last 24h)
    const hourMap: Record<number, { connections: number; messages: number }> = {};
    for (let h = 0; h < 24; h++) hourMap[h] = { connections: 0, messages: 0 };
    (raw.recent_connections || []).forEach((c) => {
      const h = new Date(c.created_at).getHours();
      hourMap[h].connections++;
    });
    (raw.recent_messages || []).forEach((m) => {
      const h = new Date(m.created_at).getHours();
      hourMap[h].messages++;
    });
    const activityByHour = Object.entries(hourMap).map(([hour, d]) => ({
      hour: parseInt(hour),
      ...d,
    }));

    setAnalytics({
      totalUsers: raw.total_users || 0,
      presentNow: raw.present_now || 0,
      totalConnections: raw.total_connections || 0,
      pendingConnections: raw.pending_connections || 0,
      totalMessages: raw.total_messages || 0,
      topInterests: raw.top_interests || [],
      recentSignups: raw.recent_signups || [],
      activityByHour,
    });
    setLoadingAnalytics(false);
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-warm)] flex items-center justify-center p-6">
        <div className="card p-10 text-center max-w-sm">
          <p className="font-serif text-xl text-[var(--color-text-header)] mb-2">Access Denied</p>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">This page is for event organisers only.</p>
          <button onClick={() => navigate('/radar')} className="btn-primary px-8 py-3 text-sm">Back to Radar</button>
        </div>
      </div>
    );
  }

  const handleSendInvites = async () => {
    const emails = emailList
      .split(/[\n,;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e.includes('@'));

    if (emails.length === 0) return;
    setSending(true);
    setResults([]);

    const inviteResults: InviteResult[] = [];

    for (const email of emails) {
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding`,
            shouldCreateUser: true,
          },
        });
        if (error) {
          inviteResults.push({ email, status: 'error', message: error.message });
        } else {
          inviteResults.push({ email, status: 'sent' });
        }
      } catch (e: any) {
        inviteResults.push({ email, status: 'error', message: e.message || 'Unknown error' });
      }
      await new Promise(r => setTimeout(r, 300));
    }

    setResults(inviteResults);
    setSending(false);
  };

  const sentCount = results.filter(r => r.status === 'sent').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  // Activity chart: simple bar chart
  const maxActivity = analytics ? Math.max(...analytics.activityByHour.map(h => h.connections + h.messages), 1) : 1;

  return (
    <div className="min-h-screen bg-[var(--color-bg-warm)] pb-24">
      <div className="max-w-lg mx-auto px-6 pt-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-serif text-3xl text-[var(--color-text-header)] mb-1">Organiser Hub</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">{APP_CONFIG.APP_NAME} admin</p>
          </div>
          <button
            onClick={() => navigate('/radar')}
            className="w-10 h-10 flex items-center justify-center text-[var(--color-steel-light)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Close"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </header>

        {/* Tabs */}
        <div className="flex gap-1 bg-[var(--color-sand-light)] rounded-2xl p-1 mb-8">
          {(['overview', 'invite'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-[12px] font-semibold uppercase tracking-widest rounded-xl transition-all ${
                tab === t
                  ? 'bg-white text-[var(--color-text-header)] shadow-sm'
                  : 'text-[var(--color-steel-light)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {t === 'overview' ? 'Analytics' : 'Invite'}
            </button>
          ))}
        </div>

        {/* ── ANALYTICS TAB ── */}
        {tab === 'overview' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            {loadingAnalytics ? (
              <div className="text-center py-16">
                <div className="w-10 h-10 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin mx-auto mb-3" />
                <p className="section-label">Loading analytics...</p>
              </div>
            ) : analytics && (
              <>
                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Total Users" value={analytics.totalUsers} />
                  <StatCard label="Present Now" value={analytics.presentNow} accent />
                  <StatCard label="Connections" value={analytics.totalConnections} />
                  <StatCard label="Messages" value={analytics.totalMessages} />
                </div>

                {/* Pending requests */}
                {analytics.pendingConnections > 0 && (
                  <div className="bg-[var(--color-accent)]/8 border border-[var(--color-accent)]/20 rounded-2xl px-4 py-3 flex items-center gap-3">
                    <span className="w-2.5 h-2.5 bg-[var(--color-accent)] rounded-full animate-gentle-pulse" />
                    <p className="text-sm text-[var(--color-text-primary)]">
                      <span className="font-semibold">{analytics.pendingConnections}</span> pending connection{analytics.pendingConnections !== 1 ? 's' : ''} waiting for response
                    </p>
                  </div>
                )}

                {/* Engagement ratio */}
                <div className="card p-5">
                  <p className="section-label mb-3">Engagement</p>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-[12px] mb-1">
                        <span className="text-[var(--color-text-secondary)]">Connection rate</span>
                        <span className="font-semibold text-[var(--color-text-header)]">
                          {analytics.totalUsers > 0 ? Math.round((analytics.totalConnections / analytics.totalUsers) * 100) : 0}%
                        </span>
                      </div>
                      <div className="h-2 bg-[var(--color-sand-light)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--color-primary)] rounded-full transition-all"
                          style={{ width: `${Math.min(100, analytics.totalUsers > 0 ? (analytics.totalConnections / analytics.totalUsers) * 100 : 0)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[12px] mb-1">
                        <span className="text-[var(--color-text-secondary)]">Messages per user</span>
                        <span className="font-semibold text-[var(--color-text-header)]">
                          {analytics.totalUsers > 0 ? (analytics.totalMessages / analytics.totalUsers).toFixed(1) : '0'}
                        </span>
                      </div>
                      <div className="h-2 bg-[var(--color-sand-light)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--color-accent)] rounded-full transition-all"
                          style={{ width: `${Math.min(100, analytics.totalUsers > 0 ? (analytics.totalMessages / analytics.totalUsers) * 5 : 0)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Activity Chart (24h) */}
                <div className="card p-5">
                  <p className="section-label mb-4">Activity — Last 24 Hours</p>
                  <div className="flex items-end gap-0.5 h-24">
                    {analytics.activityByHour.map((h) => {
                      const total = h.connections + h.messages;
                      const pct = (total / maxActivity) * 100;
                      const now = new Date().getHours();
                      return (
                        <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className={`w-full rounded-t transition-all ${h.hour === now ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-primary)]/30'}`}
                            style={{ height: `${Math.max(pct, 2)}%` }}
                            title={`${h.hour}:00 — ${h.connections} connections, ${h.messages} messages`}
                          />
                          {h.hour % 6 === 0 && (
                            <span className="text-[8px] text-[var(--color-steel-light)]">{h.hour}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-3 justify-center">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
                      <span className="text-[10px] text-[var(--color-text-secondary)]">Current hour</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]/30" />
                      <span className="text-[10px] text-[var(--color-text-secondary)]">Connections + Messages</span>
                    </div>
                  </div>
                </div>

                {/* Top Interests */}
                {analytics.topInterests.length > 0 && (
                  <div className="card p-5">
                    <p className="section-label mb-3">Top Interests</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analytics.topInterests.map((i) => (
                        <span key={i.name} className="text-[12px] font-medium text-[var(--color-primary-dark)] bg-[var(--color-primary)]/8 px-3 py-1.5 rounded-full border border-[var(--color-primary)]/10">
                          {i.name} <span className="text-[var(--color-steel-light)] ml-0.5">({i.count})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Signups */}
                {analytics.recentSignups.length > 0 && (
                  <div className="card p-5">
                    <p className="section-label mb-3">Recent Signups</p>
                    <div className="space-y-2">
                      {analytics.recentSignups.map((u) => (
                        <div key={u.id} className="flex items-center gap-3 py-1.5">
                          <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white font-serif text-sm flex-shrink-0">
                            {(u.full_name || '?').charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{u.full_name || 'Unnamed'}</p>
                          </div>
                          <span className="text-[11px] text-[var(--color-steel-light)] flex-shrink-0">
                            {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Refresh */}
                <button onClick={fetchAnalytics} className="btn-secondary w-full py-3 text-xs">
                  Refresh Analytics
                </button>
              </>
            )}
          </motion.div>
        )}

        {/* ── INVITE TAB ── */}
        {tab === 'invite' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="card p-6 mb-6">
              <p className="section-label mb-3">Email list</p>
              <textarea
                className="input-field min-h-[180px] resize-none font-mono text-[13px]"
                placeholder={"alice@example.com\nbob@company.com\ncarol@startup.io"}
                value={emailList}
                onChange={e => setEmailList(e.target.value)}
                disabled={sending}
              />
              <p className="text-[12px] text-[var(--color-text-secondary)] mt-2">
                One email per line, or comma-separated. Each person gets a magic link to join {APP_CONFIG.APP_NAME}.
              </p>
            </div>

            <button
              onClick={handleSendInvites}
              disabled={sending || !emailList.trim()}
              className="btn-primary w-full py-4 text-sm flex items-center justify-center gap-2 mb-6"
            >
              {sending ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                  Sending invites...
                </>
              ) : 'Send Invites'}
            </button>

            {results.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex gap-4 mb-4">
                  {sentCount > 0 && (
                    <div className="flex-1 bg-[var(--color-success)]/8 border border-[var(--color-success)]/20 rounded-2xl p-4 text-center">
                      <p className="font-serif text-2xl text-[var(--color-success)]">{sentCount}</p>
                      <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">Sent</p>
                    </div>
                  )}
                  {errorCount > 0 && (
                    <div className="flex-1 bg-[var(--color-error)]/8 border border-[var(--color-error)]/20 rounded-2xl p-4 text-center">
                      <p className="font-serif text-2xl text-[var(--color-error)]">{errorCount}</p>
                      <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">Failed</p>
                    </div>
                  )}
                </div>

                <div className="card divide-y divide-[var(--color-sand)]/60">
                  {results.map(r => (
                    <div key={r.email} className="flex items-center gap-3 px-4 py-3">
                      {r.status === 'sent' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M20 6 9 17l-5-5" /></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{r.email}</p>
                        {r.status === 'error' && r.message && (
                          <p className="text-[11px] text-[var(--color-error)] mt-0.5">{r.message}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
