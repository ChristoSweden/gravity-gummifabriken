-- Connections table for Gravity @ Gummifabriken
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(requester_id, recipient_id)
);

-- Enable RLS
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Users can see connections they're involved in
CREATE POLICY "Users can view own connections"
  ON connections FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- Users can create connection requests
CREATE POLICY "Users can send connection requests"
  ON connections FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Recipients can update connection status (accept/reject)
CREATE POLICY "Recipients can update connection status"
  ON connections FOR UPDATE
  USING (auth.uid() = recipient_id);

-- Either party can delete a connection
CREATE POLICY "Users can delete own connections"
  ON connections FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE connections;
