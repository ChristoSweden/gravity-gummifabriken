-- Events: temporary pop-up radars for conferences, meetups, hackathons
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  location_name text not null,
  venue_lat double precision,
  venue_lng double precision,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  invite_code text unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)
);

-- Who checked into an event
create table if not exists event_checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  checked_in_at timestamptz default now(),
  unique(event_id, user_id)
);

-- RLS
alter table events enable row level security;
alter table event_checkins enable row level security;

-- Anyone authenticated can view events
create policy "events_select" on events for select to authenticated using (true);
-- Only creator can update/delete their events
create policy "events_insert" on events for insert to authenticated with check (created_by = auth.uid());
create policy "events_update" on events for update to authenticated using (created_by = auth.uid());
create policy "events_delete" on events for delete to authenticated using (created_by = auth.uid());

-- Checkins: users can manage their own
create policy "checkins_select" on event_checkins for select to authenticated using (true);
create policy "checkins_insert" on event_checkins for insert to authenticated with check (user_id = auth.uid());
create policy "checkins_delete" on event_checkins for delete to authenticated using (user_id = auth.uid());

-- Index for fast lookups
create index idx_event_checkins_event on event_checkins(event_id);
create index idx_events_ends_at on events(ends_at);
