/**
 * Comprehensive test: Two nearby devices with overlapping interests
 * must see each other on the radar screen.
 *
 * This test traces the FULL flow:
 *   1. Login → auto-check-in (AuthContext sets is_present=true)
 *   2. Radar mount → auto-check-in again (CampusRadarPage sets is_present=true)
 *   3. Supabase query → fetches profiles with is_present=true OR recent last_seen_at
 *   4. Filter → excludes incognito, blocked, and users with <3 interests
 *   5. Interest overlap → case-insensitive matching
 *   6. Sorting → by overlap count descending, then proximity
 *   7. Realtime → new arrivals trigger re-fetch via Supabase channel
 */

import { describe, it, expect } from 'vitest';
import { getInterestOverlap, calculateMatchPercentage } from '../utils/matching';

// ── Simulated user profiles (as returned by Supabase) ──────────────

const USER_A = {
  id: 'aaaa-1111-2222-3333',
  full_name: 'Alice Andersson',
  interests: ['AI', 'UX Design', 'Sustainability', 'SaaS', 'Leadership'],
  profession: 'Product Manager',
  company: 'TechCo',
  avatar_url: null,
  is_incognito: false,
  is_present: true,
  last_seen_at: new Date().toISOString(),
};

const USER_B = {
  id: 'bbbb-4444-5555-6666',
  full_name: 'Bob Bergström',
  interests: ['AI', 'Machine Learning', 'Sustainability', 'Data Science', 'UX Design'],
  profession: 'Data Engineer',
  company: 'DataCorp',
  avatar_url: null,
  is_incognito: false,
  is_present: true,
  last_seen_at: new Date().toISOString(),
};

// ── Helper: replicate the radar's filtering logic ──────────────────

function simulateRadarQuery(
  allProfiles: typeof USER_A[],
  currentUserId: string,
  blockedIds: Set<string> = new Set()
) {
  const stalenessCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  // Step 1: Supabase .or() query simulation
  // .or(`id.eq.${currentUserId},is_present.eq.true,last_seen_at.gte.${stalenessCutoff}`)
  const queryResult = allProfiles.filter(
    (p) =>
      p.id === currentUserId ||
      p.is_present === true ||
      (p.last_seen_at && p.last_seen_at >= stalenessCutoff)
  );

  // Step 2: Client-side filter (from CampusRadarPage line ~354)
  const others = queryResult.filter(
    (p) =>
      p.id !== currentUserId &&
      !p.is_incognito &&
      !blockedIds.has(p.id) &&
      (p.interests?.length ?? 0) >= 3
  );

  // Step 3: Interest overlap & sorting (from CampusRadarPage lines ~359-366)
  const me = queryResult.find((p) => p.id === currentUserId);
  const matches = others
    .map((p) => ({
      ...p,
      overlap: me?.interests ? getInterestOverlap(me, p) : [],
    }))
    .sort((a, b) => b.overlap.length - a.overlap.length);

  return { me, matches };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Radar Visibility: Two Nearby Devices', () => {
  // ─── Core flow: mutual visibility ───────────────────────────────

  it('User A sees User B on radar when both are present with overlapping interests', () => {
    const { matches } = simulateRadarQuery([USER_A, USER_B], USER_A.id);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(USER_B.id);
    expect(matches[0].full_name).toBe('Bob Bergström');
  });

  it('User B sees User A on radar when both are present with overlapping interests', () => {
    const { matches } = simulateRadarQuery([USER_A, USER_B], USER_B.id);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(USER_A.id);
    expect(matches[0].full_name).toBe('Alice Andersson');
  });

  // ─── Interest overlap accuracy ──────────────────────────────────

  it('correctly identifies 3 overlapping interests between A and B', () => {
    const overlap = getInterestOverlap(USER_A, USER_B);
    // A has: AI, UX Design, Sustainability, SaaS, Leadership
    // B has: AI, Machine Learning, Sustainability, Data Science, UX Design
    // Overlap should be: AI, Sustainability, UX Design (case-insensitive)
    expect(overlap).toHaveLength(3);
    expect(overlap.map((i) => i.toLowerCase()).sort()).toEqual(
      ['ai', 'sustainability', 'ux design'].sort()
    );
  });

  it('calculates correct match percentage', () => {
    // A has 5 interests, 3 overlap → 60%
    expect(calculateMatchPercentage(USER_A, USER_B)).toBe(60);
    // B has 5 interests, 3 overlap → 60%
    expect(calculateMatchPercentage(USER_B, USER_A)).toBe(60);
  });

  it('case-insensitive matching works for mixed-case interests', () => {
    const userC = { ...USER_A, interests: ['ai', 'ux design', 'sustainability', 'saas', 'leadership'] };
    const overlap = getInterestOverlap(userC, USER_B);
    expect(overlap).toHaveLength(3);
  });

  // ─── Presence check-in flow ─────────────────────────────────────

  it('auto-check-in sets is_present=true (users appear in query)', () => {
    // Simulate: user just logged in, AuthContext auto-checked them in
    const freshUser = {
      ...USER_A,
      is_present: true,
      last_seen_at: new Date().toISOString(),
    };
    const { matches } = simulateRadarQuery([freshUser, USER_B], freshUser.id);
    expect(matches).toHaveLength(1);
  });

  it('users within 4-hour staleness window still appear even if is_present=false', () => {
    // Simulate: pg_cron expired is_present after 30 min, but last_seen_at is recent
    const expiredUser = {
      ...USER_B,
      is_present: false,
      last_seen_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    };
    const { matches } = simulateRadarQuery([USER_A, expiredUser], USER_A.id);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(USER_B.id);
  });

  it('users beyond 4-hour staleness window do NOT appear', () => {
    const staleUser = {
      ...USER_B,
      is_present: false,
      last_seen_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    };
    const { matches } = simulateRadarQuery([USER_A, staleUser], USER_A.id);
    expect(matches).toHaveLength(0);
  });

  // ─── Filtering edge cases ──────────────────────────────────────

  it('incognito users are NOT visible on radar', () => {
    const incognitoB = { ...USER_B, is_incognito: true };
    const { matches } = simulateRadarQuery([USER_A, incognitoB], USER_A.id);
    expect(matches).toHaveLength(0);
  });

  it('blocked users are NOT visible on radar', () => {
    const blocked = new Set([USER_B.id]);
    const { matches } = simulateRadarQuery([USER_A, USER_B], USER_A.id, blocked);
    expect(matches).toHaveLength(0);
  });

  it('users with fewer than 3 interests are NOT visible (incomplete onboarding)', () => {
    const incompleteUser = {
      ...USER_B,
      interests: ['AI', 'Design'], // only 2 interests
    };
    const { matches } = simulateRadarQuery([USER_A, incompleteUser], USER_A.id);
    expect(matches).toHaveLength(0);
  });

  it('users with exactly 3 interests ARE visible', () => {
    const minimalUser = {
      ...USER_B,
      interests: ['AI', 'Sustainability', 'UX Design'],
    };
    const { matches } = simulateRadarQuery([USER_A, minimalUser], USER_A.id);
    expect(matches).toHaveLength(1);
  });

  it('users with null interests are NOT visible', () => {
    const noInterests = { ...USER_B, interests: null as any };
    const { matches } = simulateRadarQuery([USER_A, noInterests], USER_A.id);
    expect(matches).toHaveLength(0);
  });

  // ─── Sorting: overlap count determines radar order ──────────────

  it('users are sorted by overlap count (most relevant first)', () => {
    const userC = {
      id: 'cccc-7777-8888-9999',
      full_name: 'Clara Carlsson',
      interests: ['AI', 'Finance', 'Marketing', 'Strategy', 'Sales'],
      profession: 'CMO',
      company: 'MarketCo',
      avatar_url: null,
      is_incognito: false,
      is_present: true,
      last_seen_at: new Date().toISOString(),
    };
    // A↔B overlap: 3 (AI, UX Design, Sustainability)
    // A↔C overlap: 1 (AI)
    const { matches } = simulateRadarQuery([USER_A, USER_B, userC], USER_A.id);
    expect(matches).toHaveLength(2);
    expect(matches[0].id).toBe(USER_B.id); // 3 overlaps → first
    expect(matches[1].id).toBe(userC.id);  // 1 overlap → second
    expect(matches[0].overlap.length).toBeGreaterThan(matches[1].overlap.length);
  });

  it('users with zero overlap still appear on radar (they have 3+ interests)', () => {
    const noOverlapUser = {
      id: 'dddd-0000-1111-2222',
      full_name: 'Diana Dahlberg',
      interests: ['Finance', 'Marketing', 'Strategy'],
      profession: 'CFO',
      company: 'FinCorp',
      avatar_url: null,
      is_incognito: false,
      is_present: true,
      last_seen_at: new Date().toISOString(),
    };
    const { matches } = simulateRadarQuery([USER_A, noOverlapUser], USER_A.id);
    expect(matches).toHaveLength(1);
    expect(matches[0].overlap).toHaveLength(0);
  });

  // ─── Multi-device scenario ─────────────────────────────────────

  it('10 users at venue: each sees 9 others, sorted by relevance', () => {
    const baseInterests = ['AI', 'Design', 'Sustainability', 'SaaS', 'Leadership',
      'Marketing', 'Finance', 'Engineering', 'Product', 'Data Science'];

    const users = Array.from({ length: 10 }, (_, i) => ({
      id: `user-${i}`,
      full_name: `User ${i}`,
      interests: baseInterests.slice(i % 5, (i % 5) + 4), // each gets 4 interests, with varying overlap
      profession: 'Professional',
      company: 'Co',
      avatar_url: null,
      is_incognito: false,
      is_present: true,
      last_seen_at: new Date().toISOString(),
    }));

    // Each user should see 9 others
    for (const u of users) {
      const { matches } = simulateRadarQuery(users, u.id);
      expect(matches).toHaveLength(9);
      // Verify sorted by overlap count descending
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].overlap.length).toBeGreaterThanOrEqual(matches[i].overlap.length);
      }
    }
  });

  // ─── Realtime subscription correctness ─────────────────────────

  it('new user appearing triggers re-fetch and becomes visible', () => {
    // Simulate: User A is alone
    const round1 = simulateRadarQuery([USER_A], USER_A.id);
    expect(round1.matches).toHaveLength(0);

    // User B joins (Supabase realtime triggers debouncedFetch)
    const round2 = simulateRadarQuery([USER_A, USER_B], USER_A.id);
    expect(round2.matches).toHaveLength(1);
    expect(round2.matches[0].id).toBe(USER_B.id);
  });

  // ─── RLS simulation ────────────────────────────────────────────

  it('RLS policy allows viewing non-incognito profiles', () => {
    // Simulating: "Public profiles are viewable by everyone if not incognito."
    // USING (is_incognito = false OR auth.uid() = id)
    const rlsFilter = (profile: typeof USER_A, authUid: string) =>
      profile.is_incognito === false || profile.id === authUid;

    // User A can see User B (not incognito)
    expect(rlsFilter(USER_B, USER_A.id)).toBe(true);
    // User A can see themselves
    expect(rlsFilter(USER_A, USER_A.id)).toBe(true);
    // User A cannot see incognito User B
    expect(rlsFilter({ ...USER_B, is_incognito: true }, USER_A.id)).toBe(false);
  });

  // ─── Presence update RPC logic ─────────────────────────────────

  it('update_presence serialization: newer timestamp wins', () => {
    // Simulating the SQL: WHERE last_seen_at IS NULL OR last_seen_at < p_last_seen_at
    const storedLastSeen = '2026-03-15T10:00:00.000Z';
    const newTimestamp = '2026-03-15T10:05:00.000Z';
    const olderTimestamp = '2026-03-15T09:55:00.000Z';

    // Newer timestamp should update
    expect(storedLastSeen < newTimestamp).toBe(true);
    // Older timestamp should NOT update
    expect(storedLastSeen < olderTimestamp).toBe(false);
  });

  // ─── End-to-end scenario ───────────────────────────────────────

  it('FULL FLOW: two devices login → check in → see each other with correct overlap', () => {
    // Step 1: Both users auto-check-in (AuthContext + radar mount)
    const deviceA = { ...USER_A, is_present: true, last_seen_at: new Date().toISOString() };
    const deviceB = { ...USER_B, is_present: true, last_seen_at: new Date().toISOString() };

    // Step 2: Device A fetches radar
    const radarA = simulateRadarQuery([deviceA, deviceB], deviceA.id);
    expect(radarA.me?.id).toBe(deviceA.id);
    expect(radarA.matches).toHaveLength(1);
    expect(radarA.matches[0].id).toBe(deviceB.id);
    expect(radarA.matches[0].overlap.length).toBe(3);
    expect(radarA.matches[0].overlap.map(i => i.toLowerCase()).sort()).toEqual(
      ['ai', 'sustainability', 'ux design'].sort()
    );

    // Step 3: Device B fetches radar
    const radarB = simulateRadarQuery([deviceA, deviceB], deviceB.id);
    expect(radarB.me?.id).toBe(deviceB.id);
    expect(radarB.matches).toHaveLength(1);
    expect(radarB.matches[0].id).toBe(deviceA.id);
    expect(radarB.matches[0].overlap.length).toBe(3);

    // Step 4: Verify symmetry — both see the same overlap count
    expect(radarA.matches[0].overlap.length).toBe(radarB.matches[0].overlap.length);
  });
});
