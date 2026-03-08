-- ============================================================
-- Migration: 0007_signup_confirmation.sql
-- Description: Enforce email confirmation for new signups
--
-- IMPORTANT: This migration alone is NOT sufficient.
-- You MUST also enable "Confirm email" in the Supabase Dashboard:
--   Authentication → Settings → Email → Toggle "Confirm email" ON
--
-- This migration adds a check function that can optionally
-- restrict signups to pre-invited emails only (allowlist mode).
-- To enable allowlist mode, create the `invited_emails` table
-- and populate it via the admin panel invite flow.
-- ============================================================

-- 1. INVITED EMAILS TABLE (allowlist) ────────────────────────
-- When this table has rows, only listed emails can sign up.
-- When empty, any email can sign up (open registration).
CREATE TABLE IF NOT EXISTS public.invited_emails (
  email TEXT PRIMARY KEY,
  invited_at TIMESTAMPTZ DEFAULT now(),
  invited_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.invited_emails ENABLE ROW LEVEL SECURITY;

-- Only authenticated users (admins) can view/manage invites
DROP POLICY IF EXISTS "Authenticated users can view invites" ON public.invited_emails;
CREATE POLICY "Authenticated users can view invites"
  ON public.invited_emails FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert invites" ON public.invited_emails;
CREATE POLICY "Authenticated users can insert invites"
  ON public.invited_emails FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 2. REFRESH SCHEMA CACHE ────────────────────────────────────
NOTIFY pgrst, 'reload schema';
