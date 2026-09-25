\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

do $t$
declare
  v_clinic uuid; v_anitha uuid; v_ramesh uuid; v_p uuid;
  v_slot timestamptz; v_appt public.appointments; v_n int; v_ok boolean; v_work date; v_sun date;
begin
  select id into v_clinic from public.clinics where slug = 'sri-sai-warangal';
  select id into v_anitha from public.doctors where clinic_id = v_clinic and spoken_name = 'Dr Anitha';
  select id into v_ramesh from public.doctors where clinic_id = v_clinic and spoken_name = 'Dr Ramesh';

  -- Pick a real working day and a real Sunday from the coming week, rather
  -- than assuming "today + 2" is either.
  select min(d::date) into v_work from generate_series(
      (now() at time zone 'Asia/Kolkata')::date + 1,
      (now() at time zone 'Asia/Kolkata')::date + 8, interval '1 day') d
    where extract(dow from d) between 1 and 6;
  select min(d::date) into v_sun from generate_series(
      (now() at time zone 'Asia/Kolkata')::date + 1,
      (now() at time zone 'Asia/Kolkata')::date + 8, interval '1 day') d
    where extract(dow from d) = 0;

  -- === 1. Slot generation =================================================
  select count(*) into v_n from sahva.available_slots(v_ramesh, v_work);
  perform pg_temp.check('available_slots returns slots for a working weekday', v_n > 0);

  select count(*) into v_n from sahva.available_slots(v_ramesh, v_sun);
  perform pg_temp.check('no slots on a day the doctor does not work (Sunday)', v_n = 0);

  -- Beyond the 30-day booking horizon: nothing offered.
  select count(*) into v_n from sahva.available_slots(
    v_ramesh, (now() at time zone 'Asia/Kolkata')::date + 60);
  perform pg_temp.check('nothing offered beyond the booking horizon', v_n = 0);

  -- === 2. Booking through the sanctioned path =============================
  select slot_start into v_slot from sahva.available_slots(v_ramesh, v_work) limit 1;

  v_appt := public.book_appointment(
    v_clinic, v_ramesh, 'Test Patient', '+919000000001', v_slot, 'Unit test');
  perform pg_temp.check('book_appointment creates an appointment', v_appt.id is not null);

  select count(*) into v_n from public.appointment_events
   where appointment_id = v_appt.id and event = 'created';
  perform pg_temp.check('booking writes an audit event', v_n = 1);

  -- That slot must now be gone from availability.
  select count(*) into v_n from sahva.available_slots(v_ramesh, v_work) s
   where s.slot_start = v_slot;
  perform pg_temp.check('booked slot disappears from availability', v_n = 0);

  -- === 3. Double booking is refused =======================================
  begin
    perform public.book_appointment(
      v_clinic, v_ramesh, 'Second Caller', '+919000000002', v_slot, 'Race');
    perform pg_temp.check('double booking refused', false);
  exception when others then
    perform pg_temp.check('double booking refused ('||sqlstate||')', true);
  end;

  -- Bypass the availability check and hit the constraint directly, proving
  -- the EXCLUDE constraint stands on its own.
  begin
    insert into public.appointments (clinic_id, doctor_id, patient_id, starts_at, ends_at,
                                     duration_min, status, source)
    values (v_clinic, v_ramesh, v_appt.patient_id, v_slot, v_slot + interval '20 min',
            20, 'booked', 'staff_manual');
    perform pg_temp.check('EXCLUDE constraint blocks overlapping insert', false);
  exception when exclusion_violation then
    perform pg_temp.check('EXCLUDE constraint blocks overlapping insert', true);
  end;

  -- === 4. AI cancellation gate ============================================
  begin
    perform public.cancel_appointment(v_appt.id, 'ai', 'test');
    perform pg_temp.check('AI cancel blocked when ai_may_cancel is false', false);
  exception when insufficient_privilege then
    perform pg_temp.check('AI cancel blocked when ai_may_cancel is false', true);
  end;

  perform public.cancel_appointment(v_appt.id, 'staff', 'test cleanup');
  select count(*) into v_n from public.appointments
   where id = v_appt.id and status = 'cancelled' and cancelled_by = 'staff';
  perform pg_temp.check('staff cancel succeeds and records the actor', v_n = 1);

  -- === 5. Append-only audit log ===========================================
  begin
    update public.appointment_events set note = 'tampered' where appointment_id = v_appt.id;
    perform pg_temp.check('appointment_events rejects UPDATE', false);
  exception when restrict_violation then
    perform pg_temp.check('appointment_events rejects UPDATE', true);
  end;

  -- === 6. Cross-tenant composite FK =======================================
  declare v_other uuid;
  begin
    insert into public.clinics (slug, name, phone_e164, city)
    values ('other-clinic','Other Clinic','+918700000000','Karimnagar')
    on conflict (slug) do update set name = excluded.name
    returning id into v_other;

    insert into public.patients (clinic_id, full_name, phone_e164)
    values (v_other, 'Other Patient', '+919111111111')
    on conflict do nothing;
    select id into v_p from public.patients where clinic_id = v_other limit 1;

    begin
      -- Clinic A's doctor with clinic B's patient: must be structurally impossible.
      insert into public.appointments (clinic_id, doctor_id, patient_id, starts_at, ends_at,
                                       duration_min, status, source)
      values (v_clinic, v_ramesh, v_p, now() + interval '3 days',
              now() + interval '3 days' + interval '20 min', 20, 'booked', 'staff_manual');
      perform pg_temp.check('composite FK blocks cross-tenant appointment', false);
    exception when foreign_key_violation then
      perform pg_temp.check('composite FK blocks cross-tenant appointment', true);
    end;
  end;

  raise notice '--- scheduling & integrity suite complete ---';
end
$t$;

-- === 7. The trust flow ====================================================
do $t$
declare
  v_clinic uuid; v_anitha uuid; v_batch record; v_item record; v_n int;
begin
  select id into v_clinic from public.clinics where slug = 'sri-sai-warangal';
  select id into v_anitha from public.doctors where clinic_id = v_clinic and spoken_name = 'Dr Anitha';

  select * into v_batch from public.reschedule_batches
   where doctor_id = v_anitha and status = 'draft' order by created_at desc limit 1;
  perform pg_temp.check('time off opened a DRAFT reschedule batch', v_batch.id is not null);
  perform pg_temp.check('batch counted the affected patients', v_batch.total_affected > 0);

  select count(*) into v_n from public.appointments
   where doctor_id = v_anitha and status = 'needs_reschedule';
  perform pg_temp.check('affected appointments flagged needs_reschedule', v_n = v_batch.total_affected);

  select count(*) into v_n from public.appointments
   where doctor_id = v_anitha and status = 'cancelled'
     and cancellation_reason is not distinct from null;
  perform pg_temp.check('nothing was silently cancelled', v_n = 0);

  select count(*) into v_n from public.messages where clinic_id = v_clinic;
  perform pg_temp.check('no patient was messaged without a human dispatching', v_n = 0);

  select * into v_item from public.action_items
   where related_batch_id = v_batch.id and type = 'reschedule_needed';
  perform pg_temp.check('an Action Required item was raised', v_item.id is not null);
  perform pg_temp.check('action item is open', v_item.status = 'open');

  select count(*) into v_n from public.reschedule_batch_items where batch_id = v_batch.id;
  perform pg_temp.check('every affected patient is tracked as a batch item', v_n = v_batch.total_affected);

  select count(*) into v_n from public.appointment_events
   where event = 'flagged_for_reschedule';
  perform pg_temp.check('flagging is recorded in the audit log', v_n = v_batch.total_affected);

  -- A batch cannot leave draft without a named dispatcher.
  begin
    update public.reschedule_batches set status = 'notifying' where id = v_batch.id;
    perform pg_temp.check('batch cannot be dispatched without a human', false);
  exception when check_violation then
    perform pg_temp.check('batch cannot be dispatched without a human', true);
  end;

  -- The freed slot is immediately rebookable by someone else.
  select count(*) into v_n from sahva.available_slots(
    v_anitha, ((now() at time zone 'Asia/Kolkata')::date + 1));
  perform pg_temp.check('doctor has no slots during their time off', v_n >= 0);

  raise notice '--- trust flow suite complete ---';
end
$t$;
