-- ============================================================
-- Migration: 0016_atomic_connection_request.sql
-- Description: RPC function that creates a connection and
--   optional icebreaker message atomically in one transaction.
-- ============================================================

CREATE OR REPLACE FUNCTION public.send_connection_request(
  p_recipient_id UUID,
  p_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conn_id UUID;
  v_sender_id UUID := auth.uid();
BEGIN
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_sender_id = p_recipient_id THEN
    RAISE EXCEPTION 'Cannot connect with yourself';
  END IF;

  -- Insert connection (unique index prevents duplicates in both directions)
  INSERT INTO public.connections (requester_id, recipient_id)
  VALUES (v_sender_id, p_recipient_id)
  RETURNING id INTO v_conn_id;

  -- Insert icebreaker message if provided
  IF p_message IS NOT NULL AND length(trim(p_message)) > 0 THEN
    INSERT INTO public.messages (sender_id, recipient_id, content)
    VALUES (v_sender_id, p_recipient_id, trim(p_message));
  END IF;

  RETURN v_conn_id;
END;
$$;
