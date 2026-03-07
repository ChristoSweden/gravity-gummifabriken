-- ============================================================
-- Migration: 0006_presence_expiry.sql
-- Description: Auto-expire stale presence
--   1. Function to mark users as not-present after 4 hours of inactivity
--   2. pg_cron job to run every 10 minutes (if pg_cron is available)
-- ============================================================

-- 1. PRESENCE EXPIRY FUNCTION ────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_stale_presence()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE profiles
  SET is_present = false
  WHERE is_present = true
    AND last_seen_at < now() - INTERVAL '4 hours';

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_presence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_presence() TO authenticated;

-- 2. pg_cron JOB (only if extension is available) ────────────
-- Supabase hosted projects have pg_cron enabled by default.
-- This will silently skip if pg_cron is not installed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if any
    PERFORM cron.unschedule('expire-stale-presence');
    -- Run every 10 minutes
    PERFORM cron.schedule(
      'expire-stale-presence',
      '*/10 * * * *',
      'SELECT public.expire_stale_presence()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not available, presence expiry will rely on client-side checks
  RAISE NOTICE 'pg_cron not available — skipping scheduled presence expiry';
END;
$$;

-- 3. REFRESH SCHEMA CACHE ────────────────────────────────────
NOTIFY pgrst, 'reload schema';
