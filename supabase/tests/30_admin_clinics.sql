\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

do $t$
declare
  v_admin  uuid;
  v_clinic uuid := (select id from public.clinics where name = 'Anand Clinic');  -- approved, trialing (suite 29)
  v_sub    public.subscriptions;
  v_end    timestamptz;
  v_blocked boolean;
  v_n int;
begin
  insert into auth.users (email, raw_user_meta_data) values ('finance@sahva.example', '{"account_type":"admin"}'::jsonb);
  v_admin := sahva.grant_platform_admin('finance@sahva.example', 'finance', 'Finance');

  -- Grace rule ---------------------------------------------------------------
  perform pg_temp.check('a clinic on trial is live', sahva.clinic_is_live(v_clinic));
  update public.subscriptions set current_period_start = now() - interval '20 days', current_period_end = now() - interval '2 days', trial_ends_at = now() - interval '2 days'
   where clinic_id = v_clinic;
  perform pg_temp.check('two days after the trial ended it is still live (grace)', sahva.clinic_is_live(v_clinic));
  update public.subscriptions set current_period_start = now() - interval '20 days', current_period_end = now() - interval '4 days', trial_ends_at = now() - interval '4 days'
   where clinic_id = v_clinic;
  perform pg_temp.check('four days after, nothing patient-facing runs', not sahva.clinic_is_live(v_clinic));
  perform pg_temp.check('a clinic from before subscriptions is still live',
    sahva.clinic_is_live((select id from public.clinics where slug = 'krishna-karimnagar')));

  -- Adjustments --------------------------------------------------------------
  v_blocked := false;
  begin
    perform public.admin_adjust_subscription(v_clinic, 'extend_trial', 7, '  ', v_admin);
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('extending needs a reason', v_blocked);

  v_blocked := false;
  begin
    perform public.admin_adjust_subscription(v_clinic, 'extend_trial', 120, 'too long', v_admin);
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('extensions are limited to 90 days', v_blocked);

  v_sub := public.admin_adjust_subscription(v_clinic, 'extend_trial', 7, 'Owner was in hospital', v_admin, 'req-ext-1');
  perform pg_temp.check('extending a lapsed trial counts from today, not from the past',
    v_sub.current_period_end between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute');
  perform pg_temp.check('trial end moves with it', v_sub.trial_ends_at = v_sub.current_period_end);
  perform pg_temp.check('the clinic is live again', sahva.clinic_is_live(v_clinic));

  v_end := v_sub.current_period_end;
  v_sub := public.admin_adjust_subscription(v_clinic, 'extend_trial', 3, 'Second extension', v_admin);
  perform pg_temp.check('extending a running trial adds to its end', v_sub.current_period_end = v_end + interval '3 days');

  v_blocked := false;
  begin
    perform public.admin_adjust_subscription(v_clinic, 'extend_period', 7, 'wrong kind', v_admin);
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('a trial cannot be extended as a paid period', v_blocked);

  select count(*) into v_n from public.admin_audit_log
   where target_id = v_clinic::text and action = 'subscription.extend_trial' and admin_user_id = v_admin;
  perform pg_temp.check('each extension is in the audit log', v_n = 2);
  select count(*) into v_n from public.admin_audit_log
   where request_id = 'req-ext-1' and reason = 'Owner was in hospital' and (before ->> 'days')::int = 7;
  perform pg_temp.check('the audit row carries the reason and the days', v_n = 1);

  -- Summaries ------------------------------------------------------------------
  select count(*) into v_n from public.admin_clinic_summaries();
  perform pg_temp.check('the summary has a row for every clinic', v_n = (select count(*) from public.clinics));
  select count(*) into v_n from public.admin_clinic_summaries() s where s.id = v_clinic and s.is_live and s.subscription_status = 'trialing';
  perform pg_temp.check('a clinic''s summary shows its subscription and live state', v_n = 1);
end $t$;

-- None of this is reachable from a clinic session.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='ravi@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_blocked boolean := false;
begin
  begin
    perform public.admin_clinic_summaries();
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a clinic user cannot read every clinic''s summary', v_blocked);

  v_blocked := false;
  begin
    perform public.admin_adjust_subscription((select id from public.clinics where name = 'Anand Clinic'), 'extend_trial', 7, 'free time', auth.uid());
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a clinic user cannot extend a trial', v_blocked);

  v_blocked := false;
  begin
    perform count(*) from public.admin_clinic_notes;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a clinic user cannot read admin notes', v_blocked);
end $t$;
rollback;
