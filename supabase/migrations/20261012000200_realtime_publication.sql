-- ============================================================================
-- SAHVA · Publish the live tables to Supabase Realtime
--
-- The dashboard subscribes to changes on these three tables so two people at
-- the same desk never see different states. Realtime evaluates each table's
-- RLS SELECT policy against the subscriber's JWT before delivering a change,
-- so a clinic only ever receives its own rows — the same guarantee as a read.
--
-- Events only tell the browser to refetch. The API stays the source of truth;
-- a missed event costs freshness, never correctness.
-- ============================================================================

do $$
declare
  t text;
begin
  -- Supabase creates this publication; plain Postgres (CI, the test runner)
  -- does not.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['appointments', 'action_items', 'messages'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
