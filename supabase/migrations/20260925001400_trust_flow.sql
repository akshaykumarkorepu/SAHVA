-- ============================================================================
-- SAHVA · 1400 · The trust flow
--
-- "When a doctor cancels or shifts hours, the system generates an Action
--  Required queue. Staff review and trigger mass automated rescheduling
--  messages instead of letting the AI guess or silently drop bookings."
--
-- Implemented in the database rather than the application, so it holds no
-- matter which client wrote the time-off row — dashboard, API, or psql.
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
           format('Dr %s unavailable: %s', v_doctor, coalesce(new.reason, new.kind::text)),
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
      format('%s appointment(s) need rescheduling — Dr %s unavailable', v_affected, v_doctor),
      format('Dr %s is unavailable from %s to %s (%s). Review the affected patients and send reschedule messages.',
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

-- AFTER INSERT only: the processed_at write inside the function must not re-fire it.
create trigger doctor_time_off_sweep
  after insert on public.doctor_time_off
  for each row execute function sahva.sweep_time_off();

comment on function sahva.sweep_time_off is
  'Flags, never cancels. Appointments move to needs_reschedule and a DRAFT batch is opened; a named human must '
  'dispatch it before any patient is contacted.';

-- ---------------------------------------------------------------------------
-- Escalations and low-confidence calls also earn a human review.
-- ---------------------------------------------------------------------------
create or replace function sahva.flag_call_for_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type     public.action_type;
  v_severity public.action_severity;
  v_title    text;
begin
  if new.status = 'in_progress' or new.status is not distinct from old.status then
    -- only evaluate once, when the call reaches a terminal state
    if not (old.status = 'in_progress' and new.status <> 'in_progress') then
      return new;
    end if;
  end if;

  if new.escalated_to_human then
    v_type := 'ai_escalation';  v_severity := 'high';
    v_title := format('Call from %s was escalated — follow up', new.from_e164);
  elsif new.outcome = 'unresolved' or new.status in ('abandoned','failed') then
    v_type := 'missed_call_followup'; v_severity := 'normal';
    v_title := format('Unresolved call from %s', new.from_e164);
  elsif new.stt_confidence_avg is not null and new.stt_confidence_avg < 0.60
        and new.outcome in ('booked','rescheduled','cancelled') then
    -- Telugu ASR on a dialectal accent is the known weak point. A booking made
    -- off a poorly-heard call gets verified by a human before the patient turns up.
    v_type := 'low_confidence_call'; v_severity := 'high';
    v_title := format('Verify booking — speech recognition confidence %s%%',
                      round(new.stt_confidence_avg * 100));
  else
    return new;
  end if;

  insert into public.action_items (
    clinic_id, type, severity, status, title, related_call_id, related_patient_id, payload
  )
  values (
    new.clinic_id, v_type, v_severity, 'open', v_title, new.id, new.patient_id,
    jsonb_build_object('outcome', new.outcome, 'confidence', new.stt_confidence_avg)
  );

  return new;
end;
$$;

create trigger calls_flag_for_review
  after update of status on public.calls
  for each row execute function sahva.flag_call_for_review();

-- ---------------------------------------------------------------------------
-- A failed confirmation is a patient who does not know they have a booking.
-- ---------------------------------------------------------------------------
create or replace function sahva.flag_failed_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'failed' and old.status is distinct from 'failed'
     and new.appointment_id is not null then
    insert into public.action_items (
      clinic_id, type, severity, status, title, description,
      related_appointment_id, related_patient_id, payload
    )
    values (
      new.clinic_id, 'failed_message', 'high', 'open',
      format('%s to %s failed — patient may not know about their appointment',
             new.channel, new.to_e164),
      new.error_detail,
      new.appointment_id, new.patient_id,
      jsonb_build_object('message_id', new.id, 'error_code', new.error_code)
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger messages_flag_failed
  after update of status on public.messages
  for each row execute function sahva.flag_failed_message();

-- ---------------------------------------------------------------------------
-- A denied tool call means the model tried something the database refused.
-- Worth a human eye: it is either a guard rail working, or a prompt bug.
-- ---------------------------------------------------------------------------
create or replace function sahva.flag_denied_tool_call()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.allowed and new.tool_name in ('book_appointment','reschedule_appointment') then
    insert into public.action_items (
      clinic_id, type, severity, status, title, description, related_call_id, payload
    )
    values (
      new.clinic_id, 'booking_conflict', 'normal', 'open',
      format('AI booking attempt refused during a live call (%s)', new.tool_name),
      new.denial_reason, new.call_id,
      jsonb_build_object('tool', new.tool_name, 'arguments', new.arguments)
    );
  end if;
  return new;
end;
$$;

create trigger call_tool_invocations_flag_denied
  after insert on public.call_tool_invocations
  for each row execute function sahva.flag_denied_tool_call();
