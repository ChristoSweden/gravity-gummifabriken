-- ============================================================
-- Migration: 0011_push_webhooks.sql
-- Description: pg_net triggers to call push-notification Edge Function
--   on new messages and connection requests.
-- ============================================================

-- 1. ENABLE pg_net EXTENSION
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. TRIGGER FUNCTION: calls the push-notification Edge Function via pg_net
CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  payload JSONB;
  edge_url TEXT := 'https://asyooqbvnbhhgjdhhavp.supabase.co/functions/v1/push-notification';
  service_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzeW9vcWJ2bmJoaGdqZGhoYXZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjExOTUwMiwiZXhwIjoyMDg3Njk1NTAyfQ.YTmdsgwozOrNQGkgpTTFH50Wo5Kyko6oyvYf1oH9gzY';
BEGIN
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW)::jsonb
  );

  PERFORM net.http_post(
    url := edge_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    )
  );

  RETURN NEW;
END;
$fn$;

-- 3. TRIGGER ON MESSAGES
DROP TRIGGER IF EXISTS push_on_new_message ON public.messages;
CREATE TRIGGER push_on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_insert();

-- 4. TRIGGER ON CONNECTIONS
DROP TRIGGER IF EXISTS push_on_new_connection ON public.connections;
CREATE TRIGGER push_on_new_connection
  AFTER INSERT ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_insert();

-- 5. REFRESH SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
