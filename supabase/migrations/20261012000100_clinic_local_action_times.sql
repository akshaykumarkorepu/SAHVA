-- ============================================================================
-- SAHVA · Clinic-local times in Action Required text
--
-- The trust-flow sweep formatted a timestamptz straight into the description,
-- so staff read "unavailable from 2026-10-12 03:30:00+00". The text is meant
-- for a receptionist, so it is rendered once, here, in the clinic's own
-- timezone. Formatting in the UI instead would leave every other consumer of
-- the description (exports, future escalation messages) still showing UTC.
-- ============================================================================

create or replace function sahva.clinic_local_time(p_ts timestamptz, p_clinic_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- e.g. "Mon 12 Oct, 9:00 AM". FM drops the zero/space padding to_char adds.
  select to_char(p_ts at time zone coalesce(c.timezone, 'Asia/Kolkata'), 'FMDy FMDD Mon, FMHH12:MI AM')
    from (select 1) one
    left join public.clinics c on c.id = p_clinic_id;
$$;

comment on function sahva.clinic_local_time is
  'Human-readable timestamp in the clinic''s timezone, for text written into rows staff read.';

-- Body is the honorific-fixed version from 20261011000100, not the original
-- in 1400 — re-creating from 1400 would bring "Dr Dr Anitha" back.
create or replace function sahva.sweep_time_off()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_id   uuid;
  v_affected   integer;
  v_doctor     text;
begin
  select spoken_name into v_doctor from public.doctors where id = new.doctor_id;

  -- 1. Open a DRAFT batch. Draft means nothing is sent: a human must dispatch.
  insert into public.reschedule_batches (
    clinic_id, doctor_id, time_off_id, window_start, window_end,
    status, reason_note, created_by
  )
  values (
    new.clinic_id, new.doctor_id, new.id, new.starts_at, new.ends_at,
    'draft', coalesce(new.reason, new.kind::text), new.created_by
  )
  returning id into v_batch_id;

  -- 2. Move every live appointment in the window to needs_reschedule.
  --    This frees the slot (the EXCLUDE constraint ignores this status) while
  --    keeping the row, the patient link and the history intact. Nothing is
  --    cancelled and no patient is told anything yet.
  with hit as (
    update public.appointments a
       set status = 'needs_reschedule'
     where a.doctor_id = new.doctor_id
       and a.status in ('booked','confirmed')
       and tstzrange(a.starts_at, a.ends_at, '[)')
           && tstzrange(new.starts_at, new.ends_at, '[)')
    returning a.id, a.clinic_id, a.patient_id
  ),
  ev as (
    insert into public.appointment_events (
      clinic_id, appointment_id, event, actor_type, note, payload
    )
    select hit.clinic_id, hit.id, 'flagged_for_reschedule', 'system',
           format('%s unavailable: %s', v_doctor, coalesce(new.reason, new.kind::text)),
           jsonb_build_object('time_off_id', new.id, 'batch_id', v_batch_id)
    from hit
    returning 1
  ),
  items as (
    insert into public.reschedule_batch_items (
      clinic_id, batch_id, appointment_id, patient_id, status
    )
    select hit.clinic_id, v_batch_id, hit.id, hit.patient_id, 'pending'
    from hit
    returning 1
  )
  select count(*) into v_affected from hit;

  update public.reschedule_batches
     set total_affected = v_affected
   where id = v_batch_id;

  -- 3. Surface it to staff. Severity rises as the window gets closer.
  if v_affected > 0 then
    insert into public.action_items (
      clinic_id, type, severity, status, title, description,
      related_doctor_id, related_batch_id, due_by, payload
    )
    values (
      new.clinic_id,
      'reschedule_needed',
      (case
        when new.starts_at < now() + interval '4 hours'  then 'urgent'
        when new.starts_at < now() + interval '24 hours' then 'high'
        else 'normal'
      end)::public.action_severity,
      'open',
      format('%s appointment(s) need rescheduling — %s unavailable', v_affected, v_doctor),
      format('%s is unavailable from %s to %s (%s). Review the affected patients and send reschedule messages.',
             v_doctor,
             sahva.clinic_local_time(new.starts_at, new.clinic_id),
             sahva.clinic_local_time(new.ends_at, new.clinic_id),
             coalesce(new.reason, new.kind::text)),
      new.doctor_id,
      v_batch_id,
      least(new.starts_at, now() + interval '4 hours'),
      jsonb_build_object('time_off_id', new.id, 'affected', v_affected)
    );
  else
    -- No patients hit: close the empty batch rather than leaving a stale draft.
    update public.reschedule_batches set status = 'cancelled' where id = v_batch_id;
  end if;

  update public.doctor_time_off set processed_at = now() where id = new.id;
  return null;
end;
$$;

-- Rewrite descriptions already written in UTC. Only reschedule_needed items
-- carry a time-off window; the time-off row is still the source of the times.
update public.action_items ai
   set description = format(
         '%s is unavailable from %s to %s (%s). Review the affected patients and send reschedule messages.',
         d.spoken_name,
         sahva.clinic_local_time(t.starts_at, t.clinic_id),
         sahva.clinic_local_time(t.ends_at, t.clinic_id),
         coalesce(t.reason, t.kind::text))
  from public.doctor_time_off t
  join public.doctors d on d.id = t.doctor_id
 where ai.type = 'reschedule_needed'
   and t.id = (ai.payload ->> 'time_off_id')::uuid;
