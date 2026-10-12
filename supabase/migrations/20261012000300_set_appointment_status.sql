-- ============================================================================
-- SAHVA · Front-desk status changes, audited in the same transaction
--
-- POST /appointments/:id/status updated the row through the caller's own
-- RLS-scoped client, then inserted into appointment_events the same way and
-- did not check the result. appointment_events is read-only to staff by design
-- (the RLS suite asserts "nobody can hand-write the audit log"), so that insert
-- was always rejected and every staff confirm, check-in, completion and
-- no-show was missing from the audit trail.
--
-- This follows cancel_appointment and reschedule_appointment: one SECURITY
-- DEFINER function that checks access, changes the row and writes the event
-- atomically, so the status cannot change without the history recording who
-- changed it.
-- ============================================================================

create or replace function public.set_appointment_status(
  p_appointment_id uuid,
  p_status         public.appointment_status
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt  public.appointments;
  v_staff uuid := auth.uid();
begin
  if p_status not in ('confirmed', 'checked_in', 'completed', 'no_show') then
    raise exception 'Status % is not a front-desk change — use cancel or reschedule', p_status
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if v_appt.id is null then
    raise exception 'Unknown appointment %', p_appointment_id using errcode = 'no_data_found';
  end if;
  perform sahva.assert_clinic_access(v_appt.clinic_id);

  if v_appt.status in ('completed', 'cancelled') then
    raise exception 'Appointment % is already %', p_appointment_id, v_appt.status
      using errcode = 'invalid_parameter_value';
  end if;

  update public.appointments
     set status        = p_status,
         confirmed_at  = case when p_status = 'confirmed'  then now() else confirmed_at  end,
         checked_in_at = case when p_status = 'checked_in' then now() else checked_in_at end,
         completed_at  = case when p_status = 'completed'  then now() else completed_at  end
   where id = p_appointment_id
  returning * into v_appt;

  insert into public.appointment_events (clinic_id, appointment_id, event, actor_type, actor_staff_id)
  values (
    v_appt.clinic_id, v_appt.id, p_status::text::public.appointment_event,
    -- service_role callers (the API acting for no one in particular) have no
    -- uid; record them as the system rather than inventing a person.
    case when v_staff is null then 'system' else 'staff' end::public.actor_type,
    v_staff
  );

  return v_appt;
end;
$$;

grant execute on function public.set_appointment_status(uuid, public.appointment_status)
  to authenticated, service_role;

comment on function public.set_appointment_status is
  'Confirm, check in, complete or mark a no-show, and record who did it in appointment_events, atomically.';
