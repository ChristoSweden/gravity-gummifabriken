-- ============================================================
-- Migration: 0010_push_subscriptions.sql
-- Description: Store Web Push subscriptions for notifications
--
-- IMPORTANT: Set VITE_VAPID_PUBLIC_KEY in .env with your VAPID key.
-- Generate a VAPID key pair with: npx web-push generate-vapid-keys
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own subscription" ON public.push_subscriptions;
CREATE POLICY "Users manage own subscription"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
