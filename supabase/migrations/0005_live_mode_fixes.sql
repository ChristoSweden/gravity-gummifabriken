-- ============================================================
-- Migration: 0005_live_mode_fixes.sql
-- Description: Fix RLS issues that break live Supabase mode
--   1. Allow icebreaker messages when connection is pending
--   2. Admin analytics function (bypasses RLS)
--   3. Public activity feed function (bypasses RLS)
-- ============================================================

-- 1. FIX: MESSAGES INSERT POLICY ──────────────────────────────
-- The previous policy only allowed messages when connection status = 'accepted'.
-- But the app sends an icebreaker message when sending a connection request
-- (status = 'pending', sender = requester). This fix allows both cases.

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.connections
      WHERE (
        -- Accepted connection: either direction
        (status = 'accepted' AND (
          (requester_id = auth.uid() AND recipient_id = messages.recipient_id) OR
          (recipient_id = auth.uid() AND requester_id = messages.recipient_id)
        ))
        OR
        -- Pending connection: only the requester can send an icebreaker
        (status = 'pending' AND requester_id = auth.uid() AND recipient_id = messages.recipient_id)
      )
    )
  );

-- 2. ADMIN ANALYTICS FUNCTION ─────────────────────────────────
-- Returns aggregate analytics for the admin dashboard.
-- Uses SECURITY DEFINER to bypass RLS and count all rows.
-- Only callable by authenticated users (admin check is in the app).

CREATE OR REPLACE FUNCTION public.get_admin_analytics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  staleness_cutoff TIMESTAMPTZ := now() - INTERVAL '4 hours';
  day_cutoff TIMESTAMPTZ := now() - INTERVAL '24 hours';
BEGIN
  SELECT json_build_object(
    'total_users', (SELECT count(*) FROM profiles),
    'present_now', (SELECT count(*) FROM profiles WHERE is_present = true AND last_seen_at >= staleness_cutoff),
    'total_connections', (SELECT count(*) FROM connections WHERE status = 'accepted'),
    'pending_connections', (SELECT count(*) FROM connections WHERE status = 'pending'),
    'total_messages', (SELECT count(*) FROM messages),
    'top_interests', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT unnest(interests) AS name, count(*) AS count
        FROM profiles
        WHERE interests IS NOT NULL
        GROUP BY name
        ORDER BY count DESC
        LIMIT 10
      ) t
    ),
    'recent_signups', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT id, full_name, created_at
        FROM profiles
        ORDER BY created_at DESC
        LIMIT 8
      ) t
    ),
    'recent_connections', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT created_at FROM connections
        WHERE created_at >= day_cutoff
        ORDER BY created_at DESC
      ) t
    ),
    'recent_messages', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT created_at FROM messages
        WHERE created_at >= day_cutoff
        ORDER BY created_at DESC
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics() TO authenticated;

-- 3. ACTIVITY FEED FUNCTION ───────────────────────────────────
-- Returns recent check-ins and connections for the radar activity feed.
-- Uses SECURITY DEFINER to bypass RLS so all users see venue-wide activity.

CREATE OR REPLACE FUNCTION public.get_activity_feed()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  two_hours_ago TIMESTAMPTZ := now() - INTERVAL '2 hours';
BEGIN
  SELECT json_build_object(
    'recent_presence', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT full_name, last_seen_at
        FROM profiles
        WHERE is_present = true AND last_seen_at >= two_hours_ago
        ORDER BY last_seen_at DESC
        LIMIT 5
      ) t
    ),
    'recent_connections', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT created_at
        FROM connections
        WHERE status = 'accepted' AND created_at >= two_hours_ago
        ORDER BY created_at DESC
        LIMIT 5
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_activity_feed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_activity_feed() TO authenticated;

-- 4. REFRESH SCHEMA CACHE ────────────────────────────────────
NOTIFY pgrst, 'reload schema';
