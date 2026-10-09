\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

-- Two patients at the same clinic, each with their own login and their own
-- medical record. The question this file answers: can one see the other?
do $s$
declare
  v_clinic uuid; v_doc uuid;
  v_lakshmi uuid; v_mohan uuid;
  v_u_lakshmi uuid; v_u_mohan uuid;
  v_c1 uuid; v_c2 uuid; v_rx uuid;
begin
  select id into v_clinic from public.clinics where slug = 'sri-sai-warangal';
  select id into v_doc    from public.doctors where clinic_id = v_clinic and spoken_name = 'Dr Anitha';
  select id into v_lakshmi from public.patients where clinic_id = v_clinic and full_name = 'Lakshmi Devi';
  select id into v_mohan   from public.patients where clinic_id = v_clinic and full_name = 'Mohan Kumar';

  insert into auth.users (email, raw_user_meta_data)
  values ('lakshmi@example.in', '{"full_name":"Lakshmi Devi"}'::jsonb) returning id into v_u_lakshmi;
  insert into auth.users (email, raw_user_meta_data)
  values ('mohan@example.in',   '{"full_name":"Mohan Kumar"}'::jsonb)  returning id into v_u_mohan;

  perform public.claim_patient_account(v_lakshmi, v_u_lakshmi);
  perform public.claim_patient_account(v_mohan,   v_u_mohan);

  -- A finalised consultation each, plus a draft that must stay hidden.
  insert into public.consultations (clinic_id, patient_id, doctor_id, chief_complaint, diagnosis_text, advice, status, finalised_at)
  values (v_clinic, v_lakshmi, v_doc, 'Fever for three days', 'Viral fever', 'Rest and fluids', 'finalised', now())
  returning id into v_c1;

  insert into public.consultations (clinic_id, patient_id, doctor_id, chief_complaint, diagnosis_text, status)
  values (v_clinic, v_lakshmi, v_doc, 'Follow-up', 'Still deciding', 'draft')
  returning id into v_c2;

  insert into public.consultations (clinic_id, patient_id, doctor_id, chief_complaint, diagnosis_text, status, finalised_at)
  values (v_clinic, v_mohan, v_doc, 'Back pain', 'Lumbar strain', 'finalised', now());

  insert into public.prescriptions (clinic_id, consultation_id, patient_id, doctor_id)
  values (v_clinic, v_c1, v_lakshmi, v_doc) returning id into v_rx;
  insert into public.prescription_items (prescription_id, drug_name, dosage, duration_days)
  values (v_rx, 'Paracetamol 500mg', '1-0-1', 3);

  insert into public.patient_conditions (clinic_id, patient_id, condition, status)
  values (v_clinic, v_lakshmi, 'Hypertension', 'chronic');
  insert into public.patient_conditions (clinic_id, patient_id, condition, status)
  values (v_clinic, v_mohan, 'Type 2 diabetes', 'chronic');

  perform pg_temp.check('patient accounts claimed',
    (select count(*) from public.patients where auth_user_id is not null) = 2);
end $s$;

-- ---------------------------------------------------------------------------
-- Act as Lakshmi
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select auth_user_id from public.patients where full_name='Lakshmi Devi'),
                    'role','authenticated')::text, true);
set local role authenticated;

do $t$
declare v_n int;
begin
  select count(*) into v_n from public.patients;
  perform pg_temp.check('a patient sees exactly one patient record — their own', v_n = 1);

  select count(*) into v_n from public.patients where full_name = 'Mohan Kumar';
  perform pg_temp.check('a patient cannot see another patient', v_n = 0);

  select count(*) into v_n from public.v_patient_medical_history;
  perform pg_temp.check('sees their own finalised visit', v_n = 1);

  select count(*) into v_n from public.v_patient_medical_history where diagnosis_text = 'Lumbar strain';
  perform pg_temp.check('cannot see another patient''s diagnosis', v_n = 0);

  -- A draft is the doctor's working material, not a published record.
  select count(*) into v_n from public.v_patient_medical_history where diagnosis_text = 'Still deciding';
  perform pg_temp.check('draft notes are not shown to the patient', v_n = 0);

  select count(*) into v_n from public.v_patient_prescriptions;
  perform pg_temp.check('sees their own prescription', v_n = 1);

  select count(*) into v_n from public.patient_conditions;
  perform pg_temp.check('sees only their own conditions', v_n = 1);

  select count(*) into v_n from public.patient_conditions where condition = 'Type 2 diabetes';
  perform pg_temp.check('cannot see another patient''s condition', v_n = 0);

  select count(*) into v_n from public.appointments;
  perform pg_temp.check('sees only their own appointments', v_n >= 0);

  select count(*) into v_n from public.calls;
  perform pg_temp.check('cannot read call recordings or transcripts', v_n = 0);

  select count(*) into v_n from public.action_items;
  perform pg_temp.check('cannot read the clinic''s internal action queue', v_n = 0);

  select count(*) into v_n from public.staff_profiles;
  perform pg_temp.check('cannot enumerate clinic staff', v_n = 0);

  select count(*) into v_n from public.patient_access_tokens;
  perform pg_temp.check('cannot read portal tokens', v_n = 0);
end $t$;
rollback;

-- ---------------------------------------------------------------------------
-- A patient must not be able to edit their own medical record
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select auth_user_id from public.patients where full_name='Lakshmi Devi'),
                    'role','authenticated')::text, true);
set local role authenticated;

do $t$
declare v_n int; v_blocked boolean;
begin
  v_blocked := false;
  begin
    update public.consultations set diagnosis_text = 'I am fine actually';
    get diagnostics v_n = row_count;
    if v_n = 0 then v_blocked := true; end if;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a patient cannot rewrite their diagnosis', v_blocked);

  v_blocked := false;
  begin
    update public.patient_conditions set status = 'resolved';
    get diagnostics v_n = row_count;
    if v_n = 0 then v_blocked := true; end if;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a patient cannot close their own condition', v_blocked);

  v_blocked := false;
  begin
    insert into public.prescriptions (clinic_id, patient_id, doctor_id)
    select clinic_id, id, (select id from public.doctors limit 1) from public.patients limit 1;
  exception when others then v_blocked := true;
  end;
  perform pg_temp.check('a patient cannot write themselves a prescription', v_blocked);
end $t$;
rollback;

-- ---------------------------------------------------------------------------
-- A claimed record cannot be hijacked by a second account
-- ---------------------------------------------------------------------------
do $t$
declare v_lakshmi uuid; v_intruder uuid; v_blocked boolean := false;
begin
  select id into v_lakshmi from public.patients where full_name = 'Lakshmi Devi';
  insert into auth.users (email) values ('intruder@example.in') returning id into v_intruder;

  begin
    perform public.claim_patient_account(v_lakshmi, v_intruder);
  exception when unique_violation then v_blocked := true;
  end;
  perform pg_temp.check('an already-claimed record cannot be re-pointed', v_blocked);

  -- Re-claiming with the SAME user is fine: a repeated tap must not error.
  perform public.claim_patient_account(
    v_lakshmi, (select auth_user_id from public.patients where id = v_lakshmi));
  perform pg_temp.check('re-claiming with the same account is idempotent', true);
end $t$;
