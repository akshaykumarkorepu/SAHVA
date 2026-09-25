\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Act as Ravi (owner, Warangal)
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='ravi@srisai.in'),
                    'role','authenticated')::text, true);
set local role authenticated;

do $t$
declare v_n int;
begin
  select count(*) into v_n from public.clinics;
  perform pg_temp.check('owner sees exactly their own clinic', v_n = 1);

  select count(*) into v_n from public.clinics where slug = 'krishna-karimnagar';
  perform pg_temp.check('owner cannot see another clinic', v_n = 0);

  select count(*) into v_n from public.patients where full_name = 'Karimnagar Patient';
  perform pg_temp.check('owner cannot see another clinic''s patients', v_n = 0);

  select count(*) into v_n from public.patients;
  perform pg_temp.check('owner sees their own patients', v_n > 0);

  select count(*) into v_n from public.appointments;
  perform pg_temp.check('owner sees their own appointments', v_n > 0);

  select count(*) into v_n from public.calls;
  perform pg_temp.check('owner sees their own calls', v_n > 0);

  -- Views must inherit RLS via security_invoker.
  select count(*) into v_n from public.v_open_action_items;
  perform pg_temp.check('action item view is visible and scoped', v_n > 0);

  select count(*) into v_n from public.v_call_metrics_daily;
  perform pg_temp.check('metrics view is visible and scoped', v_n > 0);

  -- Writing into someone else's clinic must fail the WITH CHECK.
  begin
    insert into public.patients (clinic_id, full_name, phone_e164)
    values ((select id from public.clinics where slug='sri-sai-warangal'), 'x', '+919000000009');
    -- own clinic is fine; now try the other one by hardcoded id
    insert into public.patients (clinic_id, full_name, phone_e164)
    select id, 'Injected', '+919000000010' from public.clinics where slug='sri-sai-warangal';
    perform pg_temp.check('owner can write into their own clinic', true);
  exception when others then
    perform pg_temp.check('owner can write into their own clinic', false);
  end;

  -- Global reference data is readable.
  select count(*) into v_n from public.plans;
  perform pg_temp.check('plans are readable by any member', v_n = 3);

  select count(*) into v_n from public.message_templates where clinic_id is null;
  perform pg_temp.check('global default templates are readable', v_n > 0);
end $t$;
rollback;

-- Cross-tenant write, attempted with the real foreign clinic_id in hand.
begin;
-- Capture the foreign clinic id while still superuser, then drop to the user
-- role. Ravi is assumed to know the uuid out of band; RLS must still stop him.
select set_config('sahva.foreign_clinic',
  (select id::text from public.clinics where slug='krishna-karimnagar'), true);
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='ravi@srisai.in'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_k uuid; v_failed boolean := false;
begin
  v_k := current_setting('sahva.foreign_clinic')::uuid;
  begin
    insert into public.patients (clinic_id, full_name, phone_e164)
    values (v_k, 'Cross tenant write', '+919333333333');
  exception when insufficient_privilege then v_failed := true;
  end;
  perform pg_temp.check('cross-tenant INSERT rejected by WITH CHECK', v_failed);
end $t$;
rollback;

-- ---------------------------------------------------------------------------
-- Act as Suresh (owner, Karimnagar) — the mirror image
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='suresh@krishna.in'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_n int;
begin
  select count(*) into v_n from public.clinics;
  perform pg_temp.check('second owner sees only their own clinic', v_n = 1);

  select count(*) into v_n from public.patients;
  perform pg_temp.check('second owner sees only their own patient', v_n = 1);

  select count(*) into v_n from public.appointments;
  perform pg_temp.check('second owner sees no Warangal appointments', v_n = 0);

  select count(*) into v_n from public.clinic_faqs;
  perform pg_temp.check('second owner sees no Warangal FAQs (no fee bleed)', v_n = 0);
end $t$;
rollback;

-- ---------------------------------------------------------------------------
-- Act as Geeta (receptionist, Warangal) — role split
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='geeta@srisai.in'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_n int; v_blocked boolean := false;
begin
  select count(*) into v_n from public.appointments;
  perform pg_temp.check('receptionist sees the clinic''s appointments', v_n > 0);

  -- Day-to-day work is allowed.
  insert into public.patients (clinic_id, full_name, phone_e164)
  select id, 'Walk-in Patient', '+919444444444' from public.clinics limit 1;
  perform pg_temp.check('receptionist may add a patient', true);

  -- Configuration is not.
  begin
    update public.doctors set consult_fee_paise = 1;
    get diagnostics v_n = row_count;
    if v_n = 0 then v_blocked := true; end if;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('receptionist cannot change fees (admin-only table)', v_blocked);

  v_blocked := false;
  begin
    update public.clinic_settings set ai_may_cancel = true;
    get diagnostics v_n = row_count;
    if v_n = 0 then v_blocked := true; end if;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('receptionist cannot change AI permissions', v_blocked);

  -- Audit log is read-only for everyone.
  v_blocked := false;
  begin
    insert into public.appointment_events (clinic_id, appointment_id, event, actor_type)
    select clinic_id, id, 'completed', 'staff' from public.appointments limit 1;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('nobody can hand-write the audit log', v_blocked);
end $t$;
rollback;

-- ---------------------------------------------------------------------------
-- Anonymous must see nothing at all.
-- ---------------------------------------------------------------------------
begin;
set local role anon;
do $t$
declare v_blocked boolean := false; v_n int;
begin
  begin
    select count(*) into v_n from public.patients;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('anon role has no access to patient data', v_blocked);
end $t$;
rollback;
