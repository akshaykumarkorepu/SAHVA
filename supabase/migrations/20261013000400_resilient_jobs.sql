-- ============================================================================
-- SAHVA · Scheduled work without a single point of failure
--
-- Everything time-based that is pure database work — reminders and the admin
-- digest, owed invoices, transcript retention, security alerts, releasing
-- unconfirmed public-page requests — now runs in one function,
-- run_database_jobs(), triggered from three independent places:
--   1. pg_cron inside the database, every 10 minutes (when available);
--   2. the API's own scheduler, every 5 minutes;
--   3. GitHub Actions, every 15 minutes.
-- An advisory lock makes concurrent triggers harmless: one runs, the rest
-- return at once. Every function it calls is already idempotent.
--
-- job_runs records when each job last started and last succeeded, so a job
-- that has stopped is visible (GET /api/health/deep, Admin → Overview).
-- ============================================================================

create table public.job_runs (
  job             text primary key,
  last_started_at timestamptz,
  last_ok_at      timestamptz,
  last_error      text,
  last_source     text,
  runs            bigint not null default 0
);
alter table public.job_runs enable row level security;
revoke all on public.job_runs from authenticated, anon;

/** Record the outcome of one run of a job (API-side jobs call this). */
create or replace function public.record_job_run(p_job text, p_ok boolean, p_error text default null, p_source text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.job_runs (job, last_started_at, last_ok_at, last_error, last_source, runs)
  values (p_job, now(), case when p_ok then now() end, case when p_ok then null else left(p_error, 500) end, p_source, 1)
  on conflict (job) do update set
    last_started_at = now(),
    last_ok_at = case when p_ok then now() else public.job_runs.last_ok_at end,
    last_error = case when p_ok then null else left(p_error, 500) end,
    last_source = p_source,
    runs = public.job_runs.runs + 1;
$$;

/**
 * All database-side scheduled work, once. Returns a summary, or null when
 * another trigger is already running it.
 */
create or replace function public.run_database_jobs(p_source text default 'api')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtext('sahva.run_database_jobs')) then
    return null;
  end if;
  v := jsonb_build_object(
    'queued',             public.enqueue_scheduled_notifications(),
    'invoices_issued',    public.issue_missing_invoices(),
    'transcripts_purged', public.purge_expired_transcripts(500),
    'security_alerts',    public.enqueue_security_alerts(),
    'requests_expired',   public.expire_unverified_bookings());
  perform public.record_job_run('database_jobs', true, null, p_source);
  return v;
exception when others then
  -- The work rolled back; say so where health checks can see it. The record
  -- itself runs in its own sub-transaction so it survives.
  perform public.record_job_run('database_jobs', false, sqlerrm, p_source);
  return jsonb_build_object('error', sqlerrm);
end;
$$;

/** How stale each job is, for health checks. */
create or replace function public.job_health()
returns table (job text, last_ok_at timestamptz, minutes_since_ok integer, last_error text, last_source text)
language sql
stable
security definer
set search_path = ''
as $$
  select job, last_ok_at,
         case when last_ok_at is null then null else (extract(epoch from now() - last_ok_at) / 60)::int end,
         last_error, last_source
    from public.job_runs order by job;
$$;

revoke all on function public.record_job_run(text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.run_database_jobs(text) from public, anon, authenticated;
revoke all on function public.job_health() from public, anon, authenticated;
grant execute on function public.record_job_run(text, boolean, text, text) to service_role;
grant execute on function public.run_database_jobs(text) to service_role;
grant execute on function public.job_health() to service_role;

-- Trigger 1: the database's own scheduler, where the platform has it
-- (hosted Supabase does; a plain local PostgreSQL may not).
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'sahva-database-jobs';
    perform cron.schedule('sahva-database-jobs', '*/10 * * * *', $job$select public.run_database_jobs('pg_cron')$job$);
  end if;
end;
$cron$;
