-- ============================================================================
-- SAHVA · Track a reschedule batch to the end, truthfully
--
-- Dispatching a batch moved it to 'notifying' and nothing else happened: no
-- worker exists, no message is created, and nothing ever marked a patient as
-- rebooked. The batch said "0 notified · 0 rebooked" forever, however many
-- patients the front desk had phoned and moved.
--
-- Until WhatsApp is connected the real workflow is: a named person approves
-- the batch (the existing human-dispatch CHECK), then staff phone each patient
-- and rebook them. This migration makes the database follow that:
--
--   1. A rebook through ANY path — diary, patient portal, the AI on a call —
--      marks the batch item rebooked, because reschedule_appointment stamps
--      rescheduled_from_id on the new appointment.
--   2. Batch counts are derived from the items, never maintained by hand.
--   3. When no patient is left waiting, the batch completes and its Action
--      Required item resolves itself.
--   4. Staff cannot record contact with a patient before the batch is
--      approved — the same rule as dispatch, enforced where no client can
--      skip it.
--   5. reschedule_appointment refuses a finished appointment.
-- ============================================================================

-- 5 ---------------------------------------------------------------------------
create or replace function public.reschedule_appointment(
  p_appointment_id uuid,
  p_new_starts_at  timestamptz,
  p_new_doctor_id  uuid default null,
  p_actor          public.actor_type default 'ai',
  p_call_id        uuid default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    public.appointments;
  v_new    public.appointments;
  v_doctor uuid;
  v_name   text;
  v_phone  text;
begin
  select * into v_old from public.appointments where id = p_appointment_id;
  if v_old.id is null then
    raise exception 'Unknown appointment %', p_appointment_id using errcode = 'no_data_found';
  end if;
  perform sahva.assert_clinic_access(v_old.clinic_id);

  -- Without this, rescheduling a finished appointment "cancelled" it again and
  -- booked a fresh one — so a double-click on Rebook booked the patient twice.
  if v_old.status in ('completed', 'cancelled') then
    raise exception 'Appointment % is already %', p_appointment_id, v_old.status
      using errcode = 'invalid_parameter_value';
  end if;

  v_doctor := coalesce(p_new_doctor_id, v_old.doctor_id);
  select full_name, phone_e164 into v_name, v_phone
  from public.patients where id = v_old.patient_id;

  -- Release the old slot first so a same-doctor move onto an adjacent time
  -- is not blocked by the appointment's own exclusion range.
  update public.appointments
     set status = 'cancelled', cancelled_at = now(),
         cancelled_by = p_actor, cancellation_reason = 'Rescheduled'
   where id = p_appointment_id;

  v_new := public.book_appointment(
    v_old.clinic_id, v_doctor, v_name, v_phone, p_new_starts_at,
    v_old.reason, p_call_id,
    case when p_actor = 'ai' then 'ai_call'::public.booking_source else 'staff_manual'::public.booking_source end
  );

  update public.appointments
     set rescheduled_from_id = p_appointment_id
   where id = v_new.id
  returning * into v_new;

  insert into public.appointment_events (clinic_id, appointment_id, event, actor_type, actor_call_id, payload)
  values (
    v_old.clinic_id, v_new.id, 'rescheduled', p_actor, p_call_id,
    jsonb_build_object('from_appointment_id', p_appointment_id,
                       'from_starts_at', v_old.starts_at,
                       'to_starts_at', p_new_starts_at)
  );

  return v_new;
end;
$$;

-- 1 ---------------------------------------------------------------------------
create or replace function sahva.link_rebooked_batch_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reschedule_batch_items
     set status = 'rebooked', new_appointment_id = new.id, resolved_at = now()
   where appointment_id = new.rescheduled_from_id
     and status <> 'rebooked';
  return null;
end;
$$;

create trigger appointments_link_rebooked_batch_item
  after insert or update of rescheduled_from_id on public.appointments
  for each row when (new.rescheduled_from_id is not null)
  execute function sahva.link_rebooked_batch_item();

-- 4 ---------------------------------------------------------------------------
create or replace function sahva.guard_batch_item_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_status public.batch_status;
begin
  if new.status is distinct from old.status
     and new.status in ('notified', 'unreachable', 'cancelled') then
    select status into v_batch_status from public.reschedule_batches where id = new.batch_id;
    if v_batch_status = 'draft' then
      raise exception 'Approve this reschedule batch before recording contact with patients'
        using errcode = 'check_violation';
    end if;
    new.resolved_at := case when new.status = 'notified' then null else now() end;
  end if;
  return new;
end;
$$;

create trigger reschedule_batch_items_guard_contact
  before update of status on public.reschedule_batch_items
  for each row execute function sahva.guard_batch_item_contact();

-- 2 + 3 -----------------------------------------------------------------------
create or replace function sahva.sync_batch_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch  public.reschedule_batches;
  v_open   integer;
begin
  update public.reschedule_batches b
     set notified_count = c.told,
         rebooked_count = c.rebooked
    from (
      select count(*) filter (where status in ('notified', 'rebooked')) as told,
             count(*) filter (where status = 'rebooked')                as rebooked
        from public.reschedule_batch_items where batch_id = new.batch_id
    ) c
   where b.id = new.batch_id
  returning b.* into v_batch;

  -- 'notified' is still open: the patient was told but has not rebooked.
  select count(*) into v_open from public.reschedule_batch_items
   where batch_id = new.batch_id and status in ('pending', 'notified');

  if v_open = 0 and v_batch.status = 'notifying' then
    update public.reschedule_batches set status = 'completed' where id = new.batch_id;
    update public.action_items
       set status = 'resolved', resolved_at = now(),
           resolution_note = 'Every affected patient was rebooked, cancelled or marked unreachable.'
     where related_batch_id = new.batch_id and status in ('open', 'in_progress');
  end if;
  return null;
end;
$$;

create trigger reschedule_batch_items_sync_progress
  after update of status on public.reschedule_batch_items
  for each row when (new.status is distinct from old.status)
  execute function sahva.sync_batch_progress();

-- If every patient was already handled before anyone approved (patients can
-- rebook themselves through the portal), approval itself completes the batch.
create or replace function sahva.complete_batch_if_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.reschedule_batch_items
     where batch_id = new.id and status in ('pending', 'notified')
  ) then
    update public.reschedule_batches set status = 'completed' where id = new.id;
    update public.action_items
       set status = 'resolved', resolved_at = now(),
           resolution_note = 'Every affected patient was already handled when the batch was approved.'
     where related_batch_id = new.id and status in ('open', 'in_progress');
  end if;
  return null;
end;
$$;

create trigger reschedule_batches_complete_if_done
  after update of status on public.reschedule_batches
  for each row when (old.status = 'draft' and new.status = 'notifying')
  execute function sahva.complete_batch_if_done();
