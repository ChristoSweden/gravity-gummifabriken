-- ============================================================
-- Migration: 0008_read_receipts.sql
-- Description: Add read_at column to messages for read receipts
-- ============================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL;

-- Index for efficient unread queries
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON public.messages (recipient_id, read_at)
  WHERE read_at IS NULL;

NOTIFY pgrst, 'reload schema';
