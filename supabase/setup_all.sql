-- ============================================================
-- Gravity @ Gummifabriken — Complete Database Setup
-- SAFE TO RE-RUN: drops existing policies/triggers before recreating
-- Run this in your Supabase SQL editor
-- ============================================================

-- ============================================================
-- 1. PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  profession TEXT,
  company TEXT,
  interests TEXT[],
  intent TEXT,
  gps_enabled BOOLEAN DEFAULT true,
  notifications_enabled BOOLEAN DEFAULT true,
  is_incognito BOOLEAN DEFAULT false,
  visibility_setting TEXT DEFAULT 'All of Gummifabriken',
  profile_blur BOOLEAN DEFAULT true,
  avatar_url TEXT,
  consent_given_at TIMESTAMPTZ,
  is_present BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns that may not exist yet (safe for re-runs)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS intent TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_blur BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_present BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone if not incognito." ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone if not incognito."
  ON public.profiles FOR SELECT
  USING ( is_incognito = false OR auth.uid() = id );

DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile."
  ON public.profiles FOR INSERT
  WITH CHECK ( auth.uid() = id );

DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
CREATE POLICY "Users can update own profile."
  ON public.profiles FOR UPDATE
  USING ( auth.uid() = id );

DROP POLICY IF EXISTS "Users can delete own profile." ON public.profiles;
CREATE POLICY "Users can delete own profile."
  ON public.profiles FOR DELETE
  USING ( auth.uid() = id );

-- Enable realtime for profiles (ignore error if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. CONNECTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(requester_id, recipient_id)
);

-- Add self-connection constraint if not exists
DO $$ BEGIN
  ALTER TABLE public.connections ADD CONSTRAINT no_self_connection CHECK (requester_id != recipient_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own connections" ON public.connections;
CREATE POLICY "Users can view own connections"
  ON public.connections FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can send connection requests" ON public.connections;
CREATE POLICY "Users can send connection requests"
  ON public.connections FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Recipients can update connection status" ON public.connections;
CREATE POLICY "Recipients can update connection status"
  ON public.connections FOR UPDATE
  USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can delete own connections" ON public.connections;
CREATE POLICY "Users can delete own connections"
  ON public.connections FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- Enable realtime for connections
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.connections;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Prevent reversed duplicate connections (A→B and B→A)
DROP FUNCTION IF EXISTS check_reverse_connection() CASCADE;
CREATE OR REPLACE FUNCTION check_reverse_connection()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.connections
    WHERE requester_id = NEW.recipient_id
      AND recipient_id = NEW.requester_id
  ) THEN
    RAISE EXCEPTION 'Connection already exists in reverse direction';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_reverse_connection ON public.connections;
CREATE TRIGGER prevent_reverse_connection
  BEFORE INSERT ON public.connections
  FOR EACH ROW EXECUTE FUNCTION check_reverse_connection();

-- ============================================================
-- 3. MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 5000),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
CREATE POLICY "Users can view own messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

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

DROP POLICY IF EXISTS "Users can delete own sent messages" ON public.messages;
CREATE POLICY "Users can delete own sent messages"
  ON public.messages FOR DELETE
  USING (auth.uid() = sender_id);

-- Enable realtime for messages
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 4. AUTO updated_at TRIGGER
-- ============================================================
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
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

-- ============================================================
-- 5. GDPR RIGHT-TO-ERASURE RPC
-- SECURITY DEFINER: deletes auth.users row which CASCADEs to
-- profiles, connections, and messages — full erasure in one call.
-- ============================================================
DROP FUNCTION IF EXISTS public.delete_user();
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;

-- ============================================================
-- 6. RATE LIMITING: max 20 connection requests per user per hour
-- ============================================================
DROP FUNCTION IF EXISTS public.check_connection_rate_limit() CASCADE;
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

-- ============================================================
-- 7. PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_connections_requester ON public.connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_connections_recipient ON public.connections(recipient_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON public.connections(status);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON public.messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(sender_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_incognito ON public.profiles(is_incognito) WHERE is_incognito = false;
CREATE INDEX IF NOT EXISTS idx_profiles_updated ON public.profiles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_connections_recipient_status ON public.connections(recipient_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_profiles_is_present ON public.profiles(is_present, last_seen_at DESC);

-- ============================================================
-- 8. PRESENCE: expire stale check-ins (>4 hours)
-- Optional cleanup helper — the app also filters by staleness in queries.
-- Call via pg_cron or Supabase scheduled function if available.
-- ============================================================
DROP FUNCTION IF EXISTS public.expire_stale_presence();
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

-- ============================================================
-- 9. AVATAR STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- 10. READ RECEIPTS: add read_at column to messages
-- ============================================================
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "Recipients can mark messages as read" ON public.messages;
CREATE POLICY "Recipients can mark messages as read"
  ON public.messages FOR UPDATE
  USING (auth.uid() = recipient_id);

-- ============================================================
-- 11. BLOCKED USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own blocks" ON public.blocked_users;
CREATE POLICY "Users can view their own blocks"
  ON public.blocked_users FOR SELECT
  USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can block others" ON public.blocked_users;
CREATE POLICY "Users can block others"
  ON public.blocked_users FOR INSERT
  WITH CHECK (auth.uid() = blocker_id AND blocker_id != blocked_id);

DROP POLICY IF EXISTS "Users can unblock others" ON public.blocked_users;
CREATE POLICY "Users can unblock others"
  ON public.blocked_users FOR DELETE
  USING (auth.uid() = blocker_id);

-- ============================================================
-- 12. REPORTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can submit reports" ON public.reports;
CREATE POLICY "Users can submit reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id AND reporter_id != reported_id);

DROP POLICY IF EXISTS "Users can view own reports" ON public.reports;
CREATE POLICY "Users can view own reports"
  ON public.reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- ============================================================
-- 13. EVENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 200),
  description TEXT,
  location_name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  invite_code TEXT NOT NULL DEFAULT lower(substr(md5(random()::text), 1, 6)),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ends_after_starts CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_invite_code ON public.events(invite_code);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON public.events(starts_at);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Events are viewable by authenticated users" ON public.events;
CREATE POLICY "Events are viewable by authenticated users"
  ON public.events FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can create events" ON public.events;
CREATE POLICY "Authenticated users can create events"
  ON public.events FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Creators can update their events" ON public.events;
CREATE POLICY "Creators can update their events"
  ON public.events FOR UPDATE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Creators can delete their events" ON public.events;
CREATE POLICY "Creators can delete their events"
  ON public.events FOR DELETE
  USING (auth.uid() = created_by);

-- ============================================================
-- 14. EVENT CHECK-INS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.event_checkins (
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checked_in_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE public.event_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view event checkins" ON public.event_checkins;
CREATE POLICY "Users can view event checkins"
  ON public.event_checkins FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can check in to events" ON public.event_checkins;
CREATE POLICY "Users can check in to events"
  ON public.event_checkins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can check out of events" ON public.event_checkins;
CREATE POLICY "Users can check out of events"
  ON public.event_checkins FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 15a. APP SETTINGS TABLE (must exist before invited_emails policies)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read settings (bootstrap: insert via SQL or migration)
DROP POLICY IF EXISTS "Admin read settings" ON public.app_settings;
CREATE POLICY "Admin read settings"
  ON public.app_settings FOR SELECT
  USING (true);  -- Readable by authenticated (contains no secrets, just admin email list)

-- No INSERT/UPDATE/DELETE via API — managed by migrations only
DROP POLICY IF EXISTS "No API writes to settings" ON public.app_settings;
CREATE POLICY "No API writes to settings"
  ON public.app_settings FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No API updates to settings" ON public.app_settings;
CREATE POLICY "No API updates to settings"
  ON public.app_settings FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No API deletes to settings" ON public.app_settings;
CREATE POLICY "No API deletes to settings"
  ON public.app_settings FOR DELETE
  USING (false);

-- Helper: check if the calling user is an admin
DROP FUNCTION IF EXISTS public.is_admin();
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_settings
    WHERE key = 'admin_emails'
      AND auth.jwt() ->> 'email' = ANY(string_to_array(value, ','))
  );
$$;

-- Seed admin_emails setting (update this with your actual admin emails)
INSERT INTO public.app_settings (key, value)
VALUES ('admin_emails', '')
ON CONFLICT (key) DO NOTHING;

-- Seed venue_public_ips setting (comma-separated list of the venue WiFi's public IPs)
-- Find your venue IP: connect to venue WiFi and visit whatismyip.com
INSERT INTO public.app_settings (key, value)
VALUES ('venue_public_ips', '')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 15b. INVITED EMAILS TABLE (admin invite allowlist)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invited_emails (
  email TEXT PRIMARY KEY,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invited_emails ENABLE ROW LEVEL SECURITY;

-- Admin emails are stored in a config table; for now, restrict to
-- users whose email is listed in app_settings.admin_emails (populated at deploy).
-- As a fallback, only the user who originally invited can read their own rows.
DROP POLICY IF EXISTS "Admins can manage invites" ON public.invited_emails;
CREATE POLICY "Admins can manage invites"
  ON public.invited_emails FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_settings
      WHERE key = 'admin_emails'
        AND auth.jwt() ->> 'email' = ANY(string_to_array(value, ','))
    )
  );

-- Fallback: allow the user who invited to see their own invites
DROP POLICY IF EXISTS "Inviters can view own invites" ON public.invited_emails;
CREATE POLICY "Inviters can view own invites"
  ON public.invited_emails FOR SELECT
  USING (auth.uid() = invited_by);

-- ============================================================
-- 16. PUSH SUBSCRIPTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own push subscription" ON public.push_subscriptions;
CREATE POLICY "Users can manage own push subscription"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- 17. RPC: send_connection_request (atomic insert + message)
-- ============================================================
DROP FUNCTION IF EXISTS public.send_connection_request(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.send_connection_request(
  p_recipient_id UUID,
  p_message TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_conn_id UUID;
BEGIN
  -- Insert the connection request
  INSERT INTO public.connections (requester_id, recipient_id, status)
  VALUES (auth.uid(), p_recipient_id, 'pending')
  RETURNING id INTO v_conn_id;

  -- Optionally attach an icebreaker message
  IF p_message IS NOT NULL AND char_length(trim(p_message)) > 0 THEN
    INSERT INTO public.messages (sender_id, recipient_id, content)
    VALUES (auth.uid(), p_recipient_id, trim(p_message));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.send_connection_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_connection_request(UUID, TEXT) TO authenticated;

-- ============================================================
-- 18. RPC: update_presence (GPS heartbeat)
-- ============================================================
DROP FUNCTION IF EXISTS public.update_presence(BOOLEAN, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION public.update_presence(
  p_is_present BOOLEAN,
  p_last_seen_at TIMESTAMPTZ
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET is_present = p_is_present,
      last_seen_at = p_last_seen_at
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.update_presence(BOOLEAN, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_presence(BOOLEAN, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- 19. RPC: get_activity_feed (venue-wide, bypasses RLS)
-- ============================================================
DROP FUNCTION IF EXISTS public.get_activity_feed();
CREATE OR REPLACE FUNCTION public.get_activity_feed()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'recent_presence', COALESCE((
      SELECT json_agg(row_to_json(p))
      FROM (
        SELECT full_name, last_seen_at
        FROM public.profiles
        WHERE is_present = true
          AND last_seen_at > now() - INTERVAL '2 hours'
        ORDER BY last_seen_at DESC
        LIMIT 10
      ) p
    ), '[]'::json),
    'recent_connections', COALESCE((
      SELECT json_agg(row_to_json(c))
      FROM (
        SELECT created_at
        FROM public.connections
        WHERE status = 'accepted'
          AND created_at > now() - INTERVAL '2 hours'
        ORDER BY created_at DESC
        LIMIT 10
      ) c
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_activity_feed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_activity_feed() TO authenticated;

-- ============================================================
-- 20. RPC: get_admin_analytics (admin dashboard)
-- ============================================================
DROP FUNCTION IF EXISTS public.get_admin_analytics();
CREATE OR REPLACE FUNCTION public.get_admin_analytics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_result json;
BEGIN
  -- Verify caller is an admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT json_build_object(
    'total_users', (SELECT count(*) FROM public.profiles),
    'present_now', (SELECT count(*) FROM public.profiles WHERE is_present = true AND last_seen_at > now() - INTERVAL '30 minutes'),
    'total_connections', (SELECT count(*) FROM public.connections WHERE status = 'accepted'),
    'pending_connections', (SELECT count(*) FROM public.connections WHERE status = 'pending'),
    'total_messages', (SELECT count(*) FROM public.messages),
    'top_interests', COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT unnest(interests) AS name, count(*) AS count
        FROM public.profiles
        WHERE interests IS NOT NULL
        GROUP BY name
        ORDER BY count DESC
        LIMIT 10
      ) t
    ), '[]'::json),
    'recent_signups', COALESCE((
      SELECT json_agg(row_to_json(s))
      FROM (
        SELECT id, full_name, created_at
        FROM public.profiles
        ORDER BY created_at DESC
        LIMIT 10
      ) s
    ), '[]'::json),
    'recent_connections', COALESCE((
      SELECT json_agg(row_to_json(c))
      FROM (
        SELECT created_at
        FROM public.connections
        WHERE created_at > now() - INTERVAL '24 hours'
        ORDER BY created_at DESC
      ) c
    ), '[]'::json),
    'recent_messages', COALESCE((
      SELECT json_agg(row_to_json(m))
      FROM (
        SELECT created_at
        FROM public.messages
        WHERE created_at > now() - INTERVAL '24 hours'
        ORDER BY created_at DESC
      ) m
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics() TO authenticated;

-- ============================================================
-- 21. REFRESH SCHEMA CACHE
-- ============================================================
NOTIFY pgrst, 'reload schema';
