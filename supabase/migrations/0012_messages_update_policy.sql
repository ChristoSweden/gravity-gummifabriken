-- ============================================================
-- Migration: 0012_messages_update_policy.sql
-- Description: Allow recipients to update messages (for read receipts)
-- ============================================================

-- Recipients can mark messages as read (update read_at)
DROP POLICY IF EXISTS "Recipients can update messages" ON public.messages;
CREATE POLICY "Recipients can update messages"
  ON public.messages FOR UPDATE
  USING (auth.uid() = recipient_id);

-- Also allow connections to be deleted (for block user flow)
DROP POLICY IF EXISTS "Users can delete own connections" ON public.connections;
CREATE POLICY "Users can delete own connections"
  ON public.connections FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

NOTIFY pgrst, 'reload schema';
