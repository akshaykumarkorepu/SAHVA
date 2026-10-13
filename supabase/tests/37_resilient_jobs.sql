\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

select set_config('request.jwt.claims', '{"role":"service_role"}', false);

do $t$
declare v jsonb; h record;
begin
  v := public.run_database_jobs('test');
  perform pg_temp.check('one call runs every database job', v ? 'queued' and v ? 'invoices_issued' and v ? 'transcripts_purged' and v ? 'security_alerts' and v ? 'requests_expired');
  select * into h from public.job_health() where job = 'database_jobs';
  perform pg_temp.check('the run is recorded with its trigger', h.last_ok_at is not null and h.minutes_since_ok = 0 and h.last_source = 'test');

  perform public.record_job_run('email_sender', false, 'provider down', 'api');
  select * into h from public.job_health() where job = 'email_sender';
  perform pg_temp.check('a failed run keeps the error and no success time', h.last_ok_at is null and h.last_error = 'provider down');
  perform public.record_job_run('email_sender', true, null, 'api');
  select * into h from public.job_health() where job = 'email_sender';
  perform pg_temp.check('a later success clears it', h.last_ok_at is not null and h.last_error is null);
  perform pg_temp.check('runs are counted', (select runs from public.job_runs where job = 'email_sender') = 2);
end $t$;

select set_config('request.jwt.claims', '', false);

begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'ravi@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$ declare v_blocked boolean := false; begin
  begin
    perform public.run_database_jobs('clinic');
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('clinics cannot trigger platform jobs', v_blocked);
end $t$;
commit;
