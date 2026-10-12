\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

select set_config('sahva_test.lakshmi', (select id::text from public.patients where full_name = 'Lakshmi Devi'), false);
select set_config('sahva_test.geeta', (select id::text from auth.users where email = 'geeta@srisai.in'), false);

-- Lakshmi reads her own record.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select auth_user_id from public.patients where full_name='Lakshmi Devi'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_blocked boolean := false;
begin
  perform public.log_record_access(current_setting('sahva_test.lakshmi')::uuid, 'medical_record', 'req-patient-1');
  perform pg_temp.check('a patient reading their own record is logged', true);

  begin
    perform public.log_record_access((select id from public.patients where full_name = 'Mohan Kumar'), 'medical_record');
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a patient cannot log (or read) someone else''s record', v_blocked);
end $t$;
commit;

-- Geeta (receptionist, Warangal) opens Lakshmi's profile.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='geeta@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_n int; v_blocked boolean := false;
begin
  perform public.log_record_access(current_setting('sahva_test.lakshmi')::uuid, 'patient_profile', 'req-staff-1');

  select count(*) into v_n from public.record_access_log;
  perform pg_temp.check('a receptionist cannot read the access log', v_n = 0);

  begin
    insert into public.record_access_log (clinic_id, patient_id, actor_type, actor_user_id, record_type)
    select clinic_id, id, 'staff', auth.uid(), 'medical_record' from public.patients limit 1;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('nobody can write the access log directly', v_blocked);
end $t$;
commit;

-- Suresh (owner, Karimnagar) must not reach a Warangal patient.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='suresh@krishna.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_blocked boolean := false; v_n int;
begin
  begin
    perform public.log_record_access(current_setting('sahva_test.lakshmi')::uuid, 'medical_record');
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('another clinic''s staff cannot read a Warangal record', v_blocked);
  select count(*) into v_n from public.record_access_log;
  perform pg_temp.check('another clinic''s owner sees none of Warangal''s log', v_n = 0);
end $t$;
rollback;

-- Ravi (owner, Warangal) reviews who looked.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='ravi@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_n int; v_blocked boolean := false;
begin
  select count(*) into v_n from public.record_access_log
   where patient_id = current_setting('sahva_test.lakshmi')::uuid;
  perform pg_temp.check('the owner sees both reads of Lakshmi''s record', v_n = 2);

  select count(*) into v_n from public.record_access_log
   where actor_type = 'staff' and actor_user_id = current_setting('sahva_test.geeta')::uuid
     and record_type = 'patient_profile' and request_id = 'req-staff-1';
  perform pg_temp.check('the staff read names the receptionist and the request', v_n = 1);

  select count(*) into v_n from public.record_access_log
   where actor_type = 'patient' and record_type = 'medical_record';
  perform pg_temp.check('the patient''s own read is recorded as the patient', v_n = 1);
end $t$;
rollback;

-- Append-only even for the table owner.
do $t$
declare v_blocked boolean := false;
begin
  begin
    delete from public.record_access_log;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('the access log cannot be deleted from', v_blocked);
end $t$;
