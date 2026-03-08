-- ============================================================
-- Migration: 0017_serialized_presence_update.sql
-- Description: RPC function for serialized presence updates.
--   Prevents concurrent tabs/devices from clobbering each other
--   by only updating if the new timestamp is more recent.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_presence(
  p_is_present BOOLEAN,
  p_last_seen_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_is_present THEN
    -- Only update if this timestamp is newer than what's stored
    UPDATE public.profiles
    SET is_present = TRUE,
        last_seen_at = p_last_seen_at
    WHERE id = v_user_id
      AND (last_seen_at IS NULL OR last_seen_at < p_last_seen_at);
  ELSE
    -- Leaving: only clear presence if no newer "present" update arrived
    UPDATE public.profiles
    SET is_present = FALSE,
        last_seen_at = NULL
    WHERE id = v_user_id
      AND (last_seen_at IS NULL OR last_seen_at <= p_last_seen_at);
  END IF;
END;
$$;
