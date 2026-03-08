-- ============================================================
-- Migration: 0009_block_report.sql
-- Description: Block and report user functionality
-- ============================================================

-- 1. BLOCKED USERS TABLE
CREATE TABLE IF NOT EXISTS public.blocked_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own blocks" ON public.blocked_users;
CREATE POLICY "Users can view their own blocks"
  ON public.blocked_users FOR SELECT
  USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can block others" ON public.blocked_users;
CREATE POLICY "Users can block others"
  ON public.blocked_users FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can unblock" ON public.blocked_users;
CREATE POLICY "Users can unblock"
  ON public.blocked_users FOR DELETE
  USING (auth.uid() = blocker_id);

-- 2. REPORTS TABLE
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create reports" ON public.reports;
CREATE POLICY "Users can create reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users can view own reports" ON public.reports;
CREATE POLICY "Users can view own reports"
  ON public.reports FOR SELECT
  USING (auth.uid() = reporter_id);

NOTIFY pgrst, 'reload schema';
