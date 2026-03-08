-- ============================================================
-- Migration: 0015_bidirectional_connection_constraint.sql
-- Description: Prevent duplicate connections in both directions
--   using a unique index on the ordered (smaller, larger) UUID pair.
--   This replaces the BEFORE INSERT trigger which has a TOCTOU race.
-- ============================================================

-- 1. Create a unique index on the canonical (sorted) pair of user IDs.
--    LEAST/GREATEST ensures (A,B) and (B,A) both map to the same pair.
CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_bidirectional
  ON public.connections (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id));

-- 2. Drop the old trigger — the unique index now handles this atomically.
DROP TRIGGER IF EXISTS prevent_reverse_connection ON public.connections;
DROP FUNCTION IF EXISTS public.check_reverse_connection();
