\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Geeta (receptionist, Warangal) runs the front desk.
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='geeta@srisai.in'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare
  v_geeta uuid := auth.uid();
  v_appt  public.appointments;
  v_after public.appointments;
  v_n     int;
  v_blocked boolean := false;
begin
  select * into v_appt from public.appointments where status in ('booked', 'confirmed') limit 1;
  perform pg_temp.check('a live Warangal appointment exists to work with', v_appt.id is not null);

  -- The old path: the row updates, but the audit insert is refused.
  begin
    insert into public.appointment_events (clinic_id, appointment_id, event, actor_type, actor_staff_id)
    values (v_appt.clinic_id, v_appt.id, 'checked_in', 'staff', v_geeta);
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('staff still cannot write the audit log directly', v_blocked);

  v_after := public.set_appointment_status(v_appt.id, 'checked_in');
  perform pg_temp.check('check-in changes the status', v_after.status = 'checked_in');
  perform pg_temp.check('check-in stamps checked_in_at', v_after.checked_in_at is not null);

  select count(*) into v_n from public.appointment_events
   where appointment_id = v_appt.id and event = 'checked_in'
     and actor_type = 'staff' and actor_staff_id = v_geeta;
  perform pg_temp.check('check-in is in the audit log, naming the receptionist', v_n = 1);

  v_after := public.set_appointment_status(v_appt.id, 'completed');
  select count(*) into v_n from public.appointment_events
   where appointment_id = v_appt.id and event = 'completed' and actor_staff_id = v_geeta;
  perform pg_temp.check('completion is in the audit log', v_n = 1);

  v_blocked := false;
  begin
    perform public.set_appointment_status(v_appt.id, 'checked_in');
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('a completed appointment cannot be reopened', v_blocked);

  v_blocked := false;
  begin
    perform public.set_appointment_status(v_appt.id, 'cancelled');
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('cancelling is refused here — it has its own audited path', v_blocked);
end $t$;
rollback;

select set_config('sahva_test.warangal_appt',
  (select a.id::text from public.appointments a join public.clinics c on c.id = a.clinic_id
    where c.slug = 'sri-sai-warangal' and a.status in ('booked','confirmed') limit 1), false);

-- ---------------------------------------------------------------------------
-- Suresh (owner, Karimnagar) must not reach a Warangal appointment.
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='suresh@krishna.in'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_id uuid; v_blocked boolean := false;
begin
  -- Suresh cannot read Warangal rows, so the id comes from outside RLS.
  v_id := nullif(current_setting('sahva_test.warangal_appt'), '');
  perform pg_temp.check('test has a Warangal appointment id to try', v_id is not null);
  begin
    perform public.set_appointment_status(v_id, 'checked_in');
  -- Only the access check counts. Any other error would pass for the wrong reason.
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('another clinic cannot change a Warangal appointment', v_blocked);
end $t$;
rollback;
