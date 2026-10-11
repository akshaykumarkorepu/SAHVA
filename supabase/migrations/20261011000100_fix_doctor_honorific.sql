-- ============================================================================
-- SAHVA · Fix "Dr Dr Anitha"
--
-- sweep_time_off() prefixed a literal "Dr " to doctors.spoken_name, which
-- already carries the honorific — that column is how the AI says the name
-- aloud, so "Dr Anitha" is the whole value, not a surname.
--
-- Every reschedule action item therefore read:
--   "2 appointment(s) need rescheduling — Dr Dr Anitha unavailable"
--
-- Found on the first run against a hosted project. Replaces the function
-- rather than editing migration 1400, which is already applied.
-- ============================================================================

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
             v_doctor, new.starts_at, new.ends_at, coalesce(new.reason, new.kind::text)),
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

comment on function sahva.sweep_time_off is
  'Flags, never cancels. Appointments move to needs_reschedule and a DRAFT batch is opened; a named human must '
  'dispatch it before any patient is contacted.';

-- Correct the open queue items the old wording already wrote. These are
-- working state, not history, so rewriting them is fair.
update public.action_items
   set title       = replace(title, 'Dr Dr ', 'Dr '),
       description = replace(description, 'Dr Dr ', 'Dr ')
 where title like '%Dr Dr %' or description like '%Dr Dr %';

-- appointment_events is deliberately NOT corrected. It is an append-only audit
-- log — an UPDATE is refused by its own trigger (SQLSTATE 23001), and that is
-- the point: what the system recorded at the time is what it recorded, typo
-- included. New events get the fixed wording.
