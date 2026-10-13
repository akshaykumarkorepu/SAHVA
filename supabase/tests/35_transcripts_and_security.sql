\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

-- An old call and a recent one at Sri Sai, both about Lakshmi.
do $s$
declare
  v_w uuid := (select id from public.clinics where slug = 'sri-sai-warangal');
  v_p uuid := (select id from public.patients where full_name = 'Lakshmi Devi');
  v_old uuid; v_new uuid;
begin
  insert into public.calls (clinic_id, from_e164, to_e164, patient_id, started_at, recording_url)
  values (v_w, '+919876500001', '+918702345678', v_p, now() - interval '100 days', 'https://rec.example/old') returning id into v_old;
  insert into public.calls (clinic_id, from_e164, to_e164, patient_id, started_at)
  values (v_w, '+919876500001', '+918702345678', v_p, now() - interval '2 days') returning id into v_new;
  insert into public.call_turns (clinic_id, call_id, turn_index, role, content) values
    (v_w, v_old, 0, 'caller', 'I have had fever for three days'),
    (v_w, v_new, 0, 'caller', 'Can I come tomorrow?');
  insert into public.call_summaries (call_id, clinic_id, summary_en) values (v_old, v_w, 'Fever, wants appointment');
  perform set_config('sahva_test.old_call', v_old::text, false);
  perform set_config('sahva_test.new_call', v_new::text, false);
end $s$;

-- A receptionist reads transcripts by default ...
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'geeta@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$ declare v_n int; begin
  select count(*) into v_n from public.call_turns where call_id = current_setting('sahva_test.new_call')::uuid;
  perform pg_temp.check('a receptionist reads transcripts by default', v_n = 1);
end $t$;
commit;

-- ... until the owner turns that off.
update public.clinic_settings set receptionists_see_transcripts = false
 where clinic_id = (select id from public.clinics where slug = 'sri-sai-warangal');

begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'geeta@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$ declare v_n int; v_c int; v_blocked boolean := false; begin
  select count(*) into v_n from public.call_turns where call_id = current_setting('sahva_test.new_call')::uuid;
  select count(*) into v_c from public.calls where id = current_setting('sahva_test.new_call')::uuid;
  perform pg_temp.check('hidden from receptionists: no words, but the call is still listed', v_n = 0 and v_c = 1);
  begin
    perform public.log_call_access(current_setting('sahva_test.new_call')::uuid, 'req-geeta');
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('and opening it is refused', v_blocked);
end $t$;
commit;

begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'ravi@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$ declare v_ok boolean; v_n int; begin
  v_ok := public.log_call_access(current_setting('sahva_test.new_call')::uuid, 'req-ravi-call');
  perform pg_temp.check('the owner opens it, and there is a transcript', v_ok);
  select count(*) into v_n from public.call_access_log where request_id = 'req-ravi-call';
  perform pg_temp.check('the opening is logged', v_n = 1);
  select count(*) into v_n from public.record_access_log where request_id = 'req-ravi-call' and record_type = 'call_transcript';
  perform pg_temp.check('and shows in the patient''s own access log', v_n = 1);
end $t$;
commit;

-- Retention ---------------------------------------------------------------------------------------
do $t$
declare v_n int; v_blocked boolean := false; v_call public.calls;
begin
  begin
    delete from public.call_turns where call_id = current_setting('sahva_test.old_call')::uuid;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('transcripts cannot be deleted by hand', v_blocked);

  v_n := public.purge_expired_transcripts();
  perform pg_temp.check('calls past 90 days are purged', v_n >= 1);
  select count(*) into v_n from public.call_turns where call_id = current_setting('sahva_test.old_call')::uuid;
  perform pg_temp.check('their words are gone', v_n = 0);
  select count(*) into v_n from public.call_summaries where call_id = current_setting('sahva_test.old_call')::uuid;
  perform pg_temp.check('their summaries too', v_n = 0);
  select * into v_call from public.calls where id = current_setting('sahva_test.old_call')::uuid;
  perform pg_temp.check('the call itself stays, marked purged, recording link removed',
    v_call.transcript_purged_at is not null and v_call.recording_url is null);
  select count(*) into v_n from public.call_turns where call_id = current_setting('sahva_test.new_call')::uuid;
  perform pg_temp.check('recent calls are untouched', v_n = 1);
  perform pg_temp.check('running again purges nothing more', public.purge_expired_transcripts() = 0);
end $t$;

-- Security events ---------------------------------------------------------------------------------
do $t$
declare v_n int; v_blocked boolean := false;
begin
  update public.clinic_members set role = 'manager'
   where staff_id = (select id from auth.users where email = 'geeta@srisai.in');
  select count(*) into v_n from public.security_events
   where kind = 'role_changed' and details->>'role_before' = 'receptionist' and details->>'role_after' = 'manager';
  perform pg_temp.check('a role change is a security event', v_n = 1);
  update public.clinic_members set role = 'receptionist'
   where staff_id = (select id from auth.users where email = 'geeta@srisai.in');

  insert into public.security_events (kind, ip, path)
  select 'auth_failed', '203.0.113.9', '/api/clinic' from generate_series(1, 25);
  v_n := public.enqueue_security_alerts();
  perform pg_temp.check('25 failures from one address raise an alert', v_n = 1);
  perform public.enqueue_security_alerts();
  select count(distinct dedupe_key) into v_n from public.notifications where kind = 'admin.security_alert';
  perform pg_temp.check('one alert per address per hour', v_n = 1);
  select count(*) into v_n from public.notifications where kind = 'admin.security_alert' and to_email = 'boss@sahva.example';
  perform pg_temp.check('super admins get it', v_n = 1);

  begin
    update public.security_events set ip = 'x' where ip = '203.0.113.9';
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('security events cannot be edited', v_blocked);
end $t$;

begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'ravi@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$ declare v_blocked boolean := false; v_n int; begin
  begin
    select count(*) into v_n from public.security_events;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('clinics cannot read security events', v_blocked);
end $t$;
commit;
