-- ============================================================
-- Migration: 0002_production_hardening.sql
-- Description: Production hardening for ~100 concurrent users
--   - avatar_url column (used by app, was missing from schema)
--   - consent_given_at for GDPR audit trail
--   - auto updated_at trigger
--   - delete_user() RPC for proper GDPR right-to-erasure
--   - rate limiting on connection requests
--   - missing messages DELETE policy
-- ============================================================

-- 1. MISSING COLUMNS ─────────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ;

-- 2. AUTO updated_at TRIGGER ────────────────────────────────
-- Ensures updated_at is always accurate regardless of app code

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3. GDPR RIGHT-TO-ERASURE RPC ──────────────────────────────
-- SECURITY DEFINER allows deleting from auth.users from the client.
-- CASCADE on auth.users automatically removes profiles, connections,
-- and messages — full erasure in a single call.

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Only authenticated users may call this on themselves
REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;

-- 4. RATE LIMITING ON CONNECTION REQUESTS ───────────────────
-- Max 20 outgoing connection requests per user per hour.
-- Prevents abuse / spam at the DB level regardless of client.

CREATE OR REPLACE FUNCTION public.check_connection_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  recent_count INT;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.connections
  WHERE requester_id = NEW.requester_id
    AND created_at > NOW() - INTERVAL '1 hour';

  IF recent_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit: too many connection requests. Try again later.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_connection_rate_limit ON public.connections;
CREATE TRIGGER enforce_connection_rate_limit
  BEFORE INSERT ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.check_connection_rate_limit();

-- 5. MISSING DELETE POLICY ON CONNECTIONS ───────────────────
-- Allows requester to cancel a sent request (already in setup_all.sql
-- but missing from 0001 migration).

DROP POLICY IF EXISTS "Users can delete own connections" ON public.connections;
CREATE POLICY "Users can delete own connections"
  ON public.connections FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- 6. MESSAGES: tighten sender check ────────────────────────
-- Ensure users can only message people they are connected to.
-- Re-applying the stricter policy from setup_all.sql.

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.connections
      WHERE status = 'accepted'
        AND (
          (requester_id = auth.uid() AND recipient_id = messages.recipient_id) OR
          (recipient_id = auth.uid() AND requester_id = messages.recipient_id)
        )
    )
  );

-- 7. ADDITIONAL INDEXES FOR 100-USER LOAD ───────────────────

-- Speeds up the radar page query (filter out incognito, order by name)
CREATE INDEX IF NOT EXISTS idx_profiles_updated ON public.profiles(updated_at DESC);

-- Speeds up pending badge count in Navbar
CREATE INDEX IF NOT EXISTS idx_connections_recipient_status
  ON public.connections(recipient_id, status)
  WHERE status = 'pending';

-- 8. REFRESH SCHEMA CACHE ───────────────────────────────────
NOTIFY pgrst, 'reload schema';
