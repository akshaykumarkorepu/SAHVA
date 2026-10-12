\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

do $s$
declare v_a uuid; v_b uuid; v_admin uuid;
begin
  insert into auth.users (email, raw_user_meta_data) values ('dr.anand@example.in', '{"full_name":"Dr Anand","account_type":"staff"}'::jsonb) returning id into v_a;
  insert into auth.users (email, raw_user_meta_data) values ('dr.bindu@example.in', '{"full_name":"Dr Bindu","account_type":"staff"}'::jsonb) returning id into v_b;
  insert into auth.users (email, raw_user_meta_data) values ('verifier@sahva.example', '{"account_type":"admin"}'::jsonb);
  v_admin := sahva.grant_platform_admin('verifier@sahva.example', 'reviewer', 'Verifier');
  perform set_config('sahva_test.anand', v_a::text, false);
  perform set_config('sahva_test.bindu', v_b::text, false);
  perform set_config('sahva_test.verifier', v_admin::text, false);
  perform pg_temp.check('clinics that existed before verification are approved',
    (select bool_and(verification_status = 'approved') from public.clinics where slug in ('sri-sai-warangal', 'krishna-karimnagar')));
end $s$;

-- Dr Anand applies with a state registration number instead of an HFR ID.
begin;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('sahva_test.anand'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_clinic uuid; v_blocked boolean := false;
begin
  begin
    perform public.submit_clinic_application('No ID Clinic', null, 'Warangal', null, '+918712100001',
      null, null, null, 'TSMC/1', 'Telangana State Medical Council', null);
  exception when check_violation then v_blocked := true;
  end;
  perform pg_temp.check('an application needs a facility ID', v_blocked);

  v_clinic := public.submit_clinic_application('Anand Clinic', null, 'Warangal', '506002', '+918712100002',
    null, 'TS/CE/2024/0457', 'Telangana', 'TSMC/55555', 'Telangana State Medical Council', '36ABCDE1234F1Z5');
  perform set_config('sahva_test.anand_clinic', v_clinic::text, false);
  perform pg_temp.check('a state registration number is accepted in place of an HFR ID', v_clinic is not null);

  -- Staff may test their diary, but patients and the AI may not book yet.
  perform pg_temp.check('the clinic is not live', not sahva.clinic_is_live(v_clinic));
end $t$;
commit;

do $t$
declare v_clinic uuid := current_setting('sahva_test.anand_clinic')::uuid; v_doc uuid; v_blocked boolean := false;
begin
  insert into public.doctors (clinic_id, spoken_name, full_name, specialty)
  values (v_clinic, 'Dr Anand', 'Dr Anand Rao', 'General Physician') returning id into v_doc;
  perform set_config('sahva_test.anand_doc', v_doc::text, false);

  -- Outside the blocks that are expected to fail, so their rollback keeps it.
  insert into public.patients (clinic_id, full_name, phone_e164) values (v_clinic, 'Test Patient', '+919000100001');

  begin
    insert into public.appointments (clinic_id, doctor_id, patient_id, starts_at, ends_at, duration_min, status, source)
    select v_clinic, v_doc, id, now() + interval '2 days', now() + interval '2 days 15 minutes', 15, 'booked', 'ai_call'
      from public.patients where clinic_id = v_clinic limit 1;
  exception when check_violation then v_blocked := true;
  end;
  perform pg_temp.check('the AI cannot book for an unapproved clinic', v_blocked);
  perform pg_temp.check('the test patient is there to try a link with',
    exists (select 1 from public.patients where clinic_id = v_clinic));

  v_blocked := false;
  begin
    insert into public.patient_access_tokens (clinic_id, patient_id, token_hash, expires_at)
    select v_clinic, id, repeat('a', 64), now() + interval '1 day' from public.patients where clinic_id = v_clinic limit 1;
  exception when check_violation then v_blocked := true;
  end;
  perform pg_temp.check('no patient links before approval', v_blocked);
end $t$;

-- Dr Bindu tries to reuse the same registration and GSTIN.
begin;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('sahva_test.bindu'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_blocked boolean := false;
begin
  begin
    perform public.submit_clinic_application('Copy Clinic', null, 'Warangal', null, '+918712100003',
      null, 'TS/CE/2024/0457', 'Telangana', 'TSMC/66666', 'Telangana State Medical Council', null);
  exception when unique_violation then v_blocked := true;
  end;
  perform pg_temp.check('a registration number already used by another clinic is refused', v_blocked);

  v_blocked := false;
  begin
    perform public.submit_clinic_application('Copy Clinic', null, 'Warangal', null, '+918712100002',
      'IN3610000555', null, null, 'TSMC/66666', 'Telangana State Medical Council', null);
  exception when unique_violation then v_blocked := true;
  end;
  perform pg_temp.check('a clinic phone already registered is refused', v_blocked);

  v_blocked := false;
  begin
    perform public.admin_review_clinic(current_setting('sahva_test.anand_clinic')::uuid, 'approve', null, auth.uid());
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a clinic user cannot approve a clinic', v_blocked);
end $t$;
rollback;

-- The review itself.
do $t$
declare
  v_clinic uuid := current_setting('sahva_test.anand_clinic')::uuid;
  v_admin uuid := current_setting('sahva_test.verifier')::uuid;
  v_blocked boolean := false; v_n int;
begin
  begin
    perform public.admin_review_clinic(v_clinic, 'needs_info', '  ', v_admin);
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('asking for more information needs a reason', v_blocked);

  perform public.admin_review_clinic(v_clinic, 'start_review', null, v_admin);
  perform public.admin_review_clinic(v_clinic, 'needs_info', 'Certificate photo is unreadable', v_admin);
  perform pg_temp.check('the owner sees the reviewer''s note',
    (select review_note = 'Certificate photo is unreadable' and verification_status = 'needs_info' from public.clinics where id = v_clinic));

  v_blocked := false;
  begin
    perform public.admin_review_clinic(v_clinic, 'approve', null, v_admin);
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('a clinic waiting on the owner cannot be approved until it is resubmitted', v_blocked);
end $t$;

begin;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('sahva_test.anand'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_c public.clinics;
begin
  v_c := public.update_clinic_application(null, 'TS/CE/2024/0457', 'Telangana', 'TSMC/55555', 'Telangana State Medical Council', '36ABCDE1234F1Z5');
  perform pg_temp.check('editing after "needs info" resubmits', v_c.verification_status = 'submitted');
end $t$;
commit;

do $t$
declare
  v_clinic uuid := current_setting('sahva_test.anand_clinic')::uuid;
  v_admin uuid := current_setting('sahva_test.verifier')::uuid;
  v_n int; v_blocked boolean := false;
begin
  perform public.admin_review_clinic(v_clinic, 'approve', null, v_admin, 'req-approve-1');
  perform pg_temp.check('approved clinics go live', sahva.clinic_is_live(v_clinic));
  select count(*) into v_n from public.subscriptions where clinic_id = v_clinic and status = 'trialing';
  perform pg_temp.check('approval starts the trial', v_n = 1);

  select count(*) into v_n from public.admin_audit_log
   where target_type = 'clinic' and target_id = v_clinic::text and admin_user_id = v_admin;
  -- start_review, needs_info, approve. The two refused attempts left no row.
  perform pg_temp.check('every decision, and only real ones, is in the admin audit log', v_n = 3);
  select count(*) into v_n from public.admin_audit_log
   where target_id = v_clinic::text and action = 'clinic.approve' and request_id = 'req-approve-1'
     and before ->> 'verification_status' = 'submitted' and after ->> 'verification_status' = 'approved';
  perform pg_temp.check('the audit row records the before and after', v_n = 1);

  insert into public.appointments (clinic_id, doctor_id, patient_id, starts_at, ends_at, duration_min, status, source)
  select v_clinic, current_setting('sahva_test.anand_doc')::uuid, id, now() + interval '3 days', now() + interval '3 days 15 minutes', 15, 'booked', 'ai_call'
    from public.patients where clinic_id = v_clinic limit 1;
  perform pg_temp.check('once approved, the AI can book', true);

  begin
    perform public.admin_review_clinic(v_clinic, 'suspend', null, v_admin);
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('suspending needs a reason', v_blocked);

  perform public.admin_review_clinic(v_clinic, 'suspend', 'Chargeback under investigation', v_admin);
  perform pg_temp.check('a suspended clinic is not live', not sahva.clinic_is_live(v_clinic));
  perform public.admin_review_clinic(v_clinic, 'reinstate', null, v_admin);
  select count(*) into v_n from public.subscriptions where clinic_id = v_clinic;
  perform pg_temp.check('reinstating does not start a second trial', v_n = 1);
end $t$;
