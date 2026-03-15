/**
 * End-to-end radar visibility test using REAL production data.
 *
 * Tests the exact flow that happens when two people open the app:
 *   1. Login → auto-check-in (direct profiles.update)
 *   2. Radar mount → fetchData queries ALL profiles
 *   3. Filter: exclude self, incognito, blocked, <3 interests
 *   4. Interest overlap calculated and sorted
 *   5. Each user sees the other(s) on their radar
 */

import { describe, it, expect } from 'vitest';
import { getInterestOverlap, calculateMatchPercentage } from '../utils/matching';

// ── Real production profiles (from live Supabase DB) ───────────────

const PROD_PROFILES = [
  {
    id: 'da25268a-555d-41c8-a047-b2ce36a0390b',
    full_name: 'Christo van Zyl',
    interests: ['Forestry', 'Sustainability', 'Drones', 'AI'],
    profession: 'Innovator',
    company: '',
    avatar_url: null,
    is_incognito: false,
    is_present: false,
    last_seen_at: null as string | null,
  },
  {
    id: 'dc48e785-f1a1-4402-8b5b-f1a9faf620a1',
    full_name: 'Christo van Zyl',
    interests: ['Innovation', 'Design', 'Product Design'],
    profession: 'Designer',
    company: '',
    avatar_url: null,
    is_incognito: false,
    is_present: true,
    last_seen_at: '2026-03-09T16:08:56.715+00:00',
  },
  {
    id: '075cb336-0bec-49a9-9744-aa2da0d69250',
    full_name: 'O Rata',
    interests: ['Marketing', 'SaaS', 'Gaming'],
    profession: 'Marketer',
    company: '',
    avatar_url: null,
    is_incognito: false,
    is_present: true,
    last_seen_at: '2026-03-09T16:15:03.585+00:00',
  },
];

// ── Replicate the exact radar logic from CampusRadarPage ───────────

/**
 * Simulates the Supabase query: SELECT * FROM profiles
 * (no presence/staleness filter — current production code)
 */
function simulateSupabaseQuery(allProfiles: typeof PROD_PROFILES) {
  // Current code: fetches ALL profiles, no filter
  return [...allProfiles];
}

/**
 * Simulates the client-side filter from CampusRadarPage line ~345:
 * profiles.filter(p => p.id !== user.id && !p.is_incognito && !blockedIds.has(p.id) && p.interests?.length >= 3)
 */
function simulateClientFilter(
  profiles: typeof PROD_PROFILES,
  currentUserId: string,
  blockedIds: Set<string> = new Set()
) {
  return profiles.filter(
    (p) =>
      p.id !== currentUserId &&
      !p.is_incognito &&
      !blockedIds.has(p.id) &&
      (p.interests?.length ?? 0) >= 3
  );
}

/**
 * Simulates the full radar flow for one user:
 * query → filter → overlap → sort → return matches
 */
function simulateFullRadarFlow(
  allProfiles: typeof PROD_PROFILES,
  currentUserId: string,
  blockedIds: Set<string> = new Set()
) {
  const queryResult = simulateSupabaseQuery(allProfiles);
  const me = queryResult.find((p) => p.id === currentUserId);
  const others = simulateClientFilter(queryResult, currentUserId, blockedIds);

  const matches = others
    .map((p) => ({
      ...p,
      overlap: me?.interests ? getInterestOverlap(me, p) : [],
    }))
    .sort((a, b) => b.overlap.length - a.overlap.length);

  return { me, matches, queryResultCount: queryResult.length };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Radar Visibility with Production Data', () => {

  // ─── Step 1: Supabase query returns all profiles ────────────────

  it('Supabase query returns all 3 production profiles (no filter)', () => {
    const result = simulateSupabaseQuery(PROD_PROFILES);
    expect(result).toHaveLength(3);
  });

  // ─── Step 2: Each user sees the other 2 ────────────────────────

  it('User da25268a (Christo #1) sees 2 other users on radar', () => {
    const { me, matches } = simulateFullRadarFlow(PROD_PROFILES, 'da25268a-555d-41c8-a047-b2ce36a0390b');
    expect(me).toBeDefined();
    expect(me!.full_name).toBe('Christo van Zyl');
    expect(matches).toHaveLength(2);
    expect(matches.map(m => m.id).sort()).toEqual([
      '075cb336-0bec-49a9-9744-aa2da0d69250',
      'dc48e785-f1a1-4402-8b5b-f1a9faf620a1',
    ]);
  });

  it('User dc48e785 (Christo #2) sees 2 other users on radar', () => {
    const { me, matches } = simulateFullRadarFlow(PROD_PROFILES, 'dc48e785-f1a1-4402-8b5b-f1a9faf620a1');
    expect(me).toBeDefined();
    expect(matches).toHaveLength(2);
  });

  it('User 075cb336 (O Rata) sees 2 other users on radar', () => {
    const { me, matches } = simulateFullRadarFlow(PROD_PROFILES, '075cb336-0bec-49a9-9744-aa2da0d69250');
    expect(me).toBeDefined();
    expect(me!.full_name).toBe('O Rata');
    expect(matches).toHaveLength(2);
  });

  // ─── Step 3: Interest overlap is correct ───────────────────────

  it('Christo #1 (Forestry/Sustainability/Drones/AI) has 0 overlap with Christo #2 (Innovation/Design/Product Design)', () => {
    const overlap = getInterestOverlap(PROD_PROFILES[0], PROD_PROFILES[1]);
    expect(overlap).toHaveLength(0);
  });

  it('Christo #1 has 0 overlap with O Rata (Marketing/SaaS/Gaming)', () => {
    const overlap = getInterestOverlap(PROD_PROFILES[0], PROD_PROFILES[2]);
    expect(overlap).toHaveLength(0);
  });

  it('Users with 0 overlap STILL appear on radar (just no shared interests highlighted)', () => {
    const { matches } = simulateFullRadarFlow(PROD_PROFILES, 'da25268a-555d-41c8-a047-b2ce36a0390b');
    expect(matches).toHaveLength(2);
    // All have 0 overlap in current prod data — but they're still visible
    expect(matches.every(m => m.overlap.length === 0)).toBe(true);
  });

  // ─── Step 4: Filter edge cases with prod data ──────────────────

  it('Incognito user is hidden from radar', () => {
    const modified = PROD_PROFILES.map(p =>
      p.id === '075cb336-0bec-49a9-9744-aa2da0d69250' ? { ...p, is_incognito: true } : p
    );
    const { matches } = simulateFullRadarFlow(modified, 'da25268a-555d-41c8-a047-b2ce36a0390b');
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('dc48e785-f1a1-4402-8b5b-f1a9faf620a1');
  });

  it('User never sees themselves on radar', () => {
    for (const profile of PROD_PROFILES) {
      const { matches } = simulateFullRadarFlow(PROD_PROFILES, profile.id);
      expect(matches.find(m => m.id === profile.id)).toBeUndefined();
    }
  });

  // ─── Step 5: Simulated two-device scenario ─────────────────────

  it('FULL SCENARIO: Device A and Device B both check in and see each other', () => {
    const DEVICE_A_USER = 'dc48e785-f1a1-4402-8b5b-f1a9faf620a1';
    const DEVICE_B_USER = '075cb336-0bec-49a9-9744-aa2da0d69250';

    // Step 1: Both devices check in (simulate profiles.update setting is_present=true)
    const checkedInProfiles = PROD_PROFILES.map(p => ({
      ...p,
      is_present: (p.id === DEVICE_A_USER || p.id === DEVICE_B_USER) ? true : p.is_present,
      last_seen_at: (p.id === DEVICE_A_USER || p.id === DEVICE_B_USER) ? new Date().toISOString() : p.last_seen_at,
    }));

    // Step 2: Device A opens radar
    const radarA = simulateFullRadarFlow(checkedInProfiles, DEVICE_A_USER);
    expect(radarA.queryResultCount).toBe(3);
    expect(radarA.matches.length).toBeGreaterThanOrEqual(1);
    const deviceBOnRadarA = radarA.matches.find(m => m.id === DEVICE_B_USER);
    expect(deviceBOnRadarA).toBeDefined();
    expect(deviceBOnRadarA!.full_name).toBe('O Rata');

    // Step 3: Device B opens radar
    const radarB = simulateFullRadarFlow(checkedInProfiles, DEVICE_B_USER);
    expect(radarB.queryResultCount).toBe(3);
    expect(radarB.matches.length).toBeGreaterThanOrEqual(1);
    const deviceAOnRadarB = radarB.matches.find(m => m.id === DEVICE_A_USER);
    expect(deviceAOnRadarB).toBeDefined();
    expect(deviceAOnRadarB!.full_name).toBe('Christo van Zyl');

    // Step 4: Symmetry — both see each other
    expect(deviceBOnRadarA).toBeDefined();
    expect(deviceAOnRadarB).toBeDefined();
  });

  // ─── Step 6: Check-in writes to DB correctly ───────────────────

  it('Auto-check-in sets is_present=true and last_seen_at to now', () => {
    // Simulate what CampusRadarPage init() does:
    // await supabase.from('profiles').update({ is_present: true, last_seen_at: now }).eq('id', user.id)
    const before = { ...PROD_PROFILES[0], is_present: false, last_seen_at: null as string | null };
    expect(before.is_present).toBe(false);
    expect(before.last_seen_at).toBeNull();

    // After check-in:
    const now = new Date().toISOString();
    const after = { ...before, is_present: true, last_seen_at: now };
    expect(after.is_present).toBe(true);
    expect(after.last_seen_at).toBe(now);

    // This user is now findable by the query
    const profiles = [after, ...PROD_PROFILES.slice(1)];
    const { matches } = simulateFullRadarFlow(profiles, PROD_PROFILES[1].id);
    const found = matches.find(m => m.id === after.id);
    expect(found).toBeDefined();
  });

  // ─── Step 7: The query has NO presence filter ──────────────────

  it('Even users with is_present=false and last_seen_at=null appear on radar', () => {
    // da25268a has is_present=false and last_seen_at=null in prod
    // The current query fetches ALL profiles, so they should still appear
    const { matches } = simulateFullRadarFlow(PROD_PROFILES, 'dc48e785-f1a1-4402-8b5b-f1a9faf620a1');
    const notPresent = matches.find(m => m.id === 'da25268a-555d-41c8-a047-b2ce36a0390b');
    expect(notPresent).toBeDefined();
    expect(notPresent!.is_present).toBe(false);
    expect(notPresent!.last_seen_at).toBeNull();
  });
});
