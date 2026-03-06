-- ============================================================
-- Migration: 0001_initial_schema.sql
-- Description: Initial setup for Gravity @ Gummifabriken
-- ============================================================

-- 1. PROFILES TABLE
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. CONNECTIONS TABLE
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(requester_id, recipient_id),
  CONSTRAINT no_self_connection CHECK (requester_id != recipient_id)
);

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

-- 3. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 5000),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES
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

DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
CREATE POLICY "Users can view own messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- 5. REVERSE CONNECTION TRIGGER
CREATE OR REPLACE FUNCTION public.check_reverse_connection()
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
  FOR EACH ROW EXECUTE FUNCTION public.check_reverse_connection();

-- 6. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_connections_requester ON public.connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_connections_recipient ON public.connections(recipient_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON public.connections(status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(sender_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_incognito ON public.profiles(is_incognito) WHERE is_incognito = false;

-- 7. REALTIME
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles, public.connections, public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
