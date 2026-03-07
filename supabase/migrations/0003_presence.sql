-- Migration 0003: GPS presence detection
-- Tracks whether a user is physically at the venue right now.
-- is_present is set to true when the app detects the user is within
-- PRESENCE_RADIUS_M of the venue coordinates, or via manual check-in.
-- last_seen_at records when the presence was last confirmed — used to
-- expire stale records so absent users automatically drop off the radar.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_present   BOOLEAN    NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Index for fast radar queries (only fetch present users)
CREATE INDEX IF NOT EXISTS idx_profiles_is_present
  ON public.profiles (is_present, last_seen_at DESC);

-- Users can only update their own presence fields (is_present, last_seen_at).
-- RLS already exists on profiles; this policy grants UPDATE for own row.
-- (The existing UPDATE policy covers all columns; no additional policy needed
--  as long as the existing "Users can update their own profile" policy exists.)

-- Helper: expire presence for users who haven't checked in for >4 hours.
-- Call this via a scheduled function or pg_cron if available, or just rely
-- on the staleness filter in the app query (last_seen_at > now() - interval '4 hours').
-- This function is optional but useful for cleanup.
CREATE OR REPLACE FUNCTION public.expire_stale_presence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET is_present = FALSE
  WHERE is_present = TRUE
    AND last_seen_at < (now() - INTERVAL '4 hours');
END;
$$;
