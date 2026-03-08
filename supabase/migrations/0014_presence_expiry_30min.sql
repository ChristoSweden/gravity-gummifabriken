-- ============================================================
-- Migration: 0014_presence_expiry_30min.sql
-- Description: Tighten presence expiry from 4 hours to 30 minutes
--   Users who haven't refreshed their GPS check within 30 minutes
--   are automatically marked as not-present. This keeps the radar
--   honest — if someone left the venue, they drop off quickly.
--   The pg_cron job now runs every 5 minutes for faster cleanup.
-- ============================================================

-- 1. UPDATE EXPIRY FUNCTION (30 min instead of 4 hours) ───────
DROP FUNCTION IF EXISTS public.expire_stale_presence();
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
    AND last_seen_at < now() - INTERVAL '30 minutes';

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_presence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_presence() TO authenticated;

-- 2. UPDATE pg_cron JOB (every 5 min instead of 10) ──────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old job
    PERFORM cron.unschedule('expire-stale-presence');
    -- Run every 5 minutes for faster cleanup
    PERFORM cron.schedule(
      'expire-stale-presence',
      '*/5 * * * *',
      'SELECT public.expire_stale_presence()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — presence expiry relies on client-side checks';
END;
$$;

-- 3. REFRESH SCHEMA CACHE ────────────────────────────────────
NOTIFY pgrst, 'reload schema';
