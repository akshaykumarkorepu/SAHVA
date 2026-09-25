-- ============================================================================
-- SAHVA · 1300 · Scheduling engine
--
-- The product's central architectural claim: the model proposes, the database
-- disposes. Availability is computed live on every call and re-verified inside
-- the booking transaction, so a stale slot the model is holding in context can
-- never become a real double booking.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- sahva.available_slots — free slots for one doctor on one clinic-local date.
--
-- Subtracts, in order: doctor not working that weekday, clinic closure,
-- doctor time off, too-soon (min notice), too-far (booking horizon), and slots
-- already at capacity.
-- ---------------------------------------------------------------------------
create or replace function sahva.available_slots(p_doctor_id uuid, p_date date)
returns table (slot_start timestamptz, slot_end timestamptz, remaining integer)
language sql
stable
security definer
set search_path = ''
as $$
  with doc as (
    select d.id, d.clinic_id, d.consult_duration_min,
           c.timezone,
           coalesce(s.booking_horizon_days, 30)::int as horizon_days,
           coalesce(s.min_notice_minutes, 30)::int   as min_notice
    from public.doctors d
    join public.clinics c on c.id = d.clinic_id
    left join public.clinic_settings s on s.clinic_id = d.clinic_id
    where d.id = p_doctor_id
      and d.is_active
      and c.is_active
  ),
  -- Refuse the whole date up front if the clinic is shut or it is out of range.
  usable as (
    select doc.* from doc
    where p_date between (now() at time zone doc.timezone)::date
                     and (now() at time zone doc.timezone)::date + doc.horizon_days
      and not exists (
        select 1 from public.clinic_closures cc
        where cc.clinic_id = doc.clinic_id
          and p_date between cc.starts_on and cc.ends_on
      )
  ),
  sess as (
    select ds.starts_at, ds.ends_at, ds.capacity_per_slot,
           coalesce(ds.slot_duration_min, u.consult_duration_min)::int as dur,
           u.timezone, u.min_notice
    from public.doctor_sessions ds
    join usable u on u.id = ds.doctor_id
    where ds.is_active
      and ds.day_of_week   = extract(dow from p_date)::smallint
      and ds.effective_from <= p_date
      and (ds.effective_to is null or ds.effective_to >= p_date)
  ),
  candidate as (
    select
      -- Naive clinic-local timestamp, then anchored to the clinic's zone.
      (g.local_ts at time zone sess.timezone)                                as slot_start,
      (g.local_ts at time zone sess.timezone) + make_interval(mins => sess.dur) as slot_end,
      sess.capacity_per_slot,
      sess.min_notice
    from sess
    cross join lateral generate_series(
      (p_date + sess.starts_at),
      (p_date + sess.ends_at) - make_interval(mins => sess.dur),
      make_interval(mins => sess.dur)
    ) as g(local_ts)
  )
  select
    c.slot_start,
    c.slot_end,
    (c.capacity_per_slot - coalesce(booked.n, 0))::integer as remaining
  from candidate c
  left join lateral (
    select count(*)::int as n
    from public.appointments a
    where a.doctor_id = p_doctor_id
      and a.status in ('booked','confirmed','checked_in')
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(c.slot_start, c.slot_end, '[)')
  ) booked on true
  where c.slot_start >= now() + make_interval(mins => c.min_notice)
    and not exists (
      select 1 from public.doctor_time_off t
      where t.doctor_id = p_doctor_id
        and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(c.slot_start, c.slot_end, '[)')
    )
    and (c.capacity_per_slot - coalesce(booked.n, 0)) > 0
  order by c.slot_start;
$$;

-- Public RPC wrapper: what the voice agent's check_availability tool calls.
create or replace function public.get_available_slots(p_doctor_id uuid, p_date date)
returns table (slot_start timestamptz, slot_end timestamptz, remaining integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clinic uuid;
begin
  select clinic_id into v_clinic from public.doctors where id = p_doctor_id;
  if v_clinic is null then
    raise exception 'Unknown doctor %', p_doctor_id using errcode = 'no_data_found';
  end if;
  perform sahva.assert_clinic_access(v_clinic);
  return query select * from sahva.available_slots(p_doctor_id, p_date);
end;
$$;

-- ---------------------------------------------------------------------------
-- public.book_appointment — the only sanctioned booking path.
--
-- Resolves or creates the patient, re-checks the slot inside the transaction,
-- writes the appointment and its audit event. The EXCLUDE constraint is the
-- last line of defence if two calls race past the availability check.
-- ---------------------------------------------------------------------------
create or replace function public.book_appointment(
  p_clinic_id    uuid,
  p_doctor_id    uuid,
  p_patient_name text,
  p_phone_e164   text,
  p_starts_at    timestamptz,
  p_reason       text default null,
  p_call_id      uuid default null,
  p_source       public.booking_source default 'ai_call',
  p_language     public.language_code default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duration   smallint;
  v_ends_at    timestamptz;
  v_patient_id uuid;
  v_appt       public.appointments;
  v_free       boolean;
begin
  perform sahva.assert_clinic_access(p_clinic_id);

  select d.consult_duration_min into v_duration
  from public.doctors d
  where d.id = p_doctor_id and d.clinic_id = p_clinic_id and d.is_active;

  if v_duration is null then
    raise exception 'Doctor % is not active at clinic %', p_doctor_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_duration);

  -- Re-verify against live availability. The model may be holding a slot it
  -- was offered thirty seconds ago; only this check counts.
  select exists (
    select 1
    from sahva.available_slots(p_doctor_id, (p_starts_at at time zone
           (select timezone from public.clinics where id = p_clinic_id))::date) s
    where s.slot_start = p_starts_at
  ) into v_free;

  if not v_free then
    raise exception 'Slot % is no longer available for doctor %', p_starts_at, p_doctor_id
      using errcode = 'exclusion_violation',
            hint = 'Offer the caller the next free slot from get_available_slots.';
  end if;

  -- One handset can carry a family, so identity is phone + normalised name.
  select p.id into v_patient_id
  from public.patients p
  where p.clinic_id = p_clinic_id
    and p.phone_e164 = p_phone_e164
    and lower(btrim(p.full_name)) = lower(btrim(p_patient_name));

  if v_patient_id is null then
    insert into public.patients (clinic_id, full_name, phone_e164, preferred_language, first_seen_via)
    values (p_clinic_id, btrim(p_patient_name), p_phone_e164,
            coalesce(p_language, (select default_language from public.clinics where id = p_clinic_id)),
            p_source)
    returning id into v_patient_id;
  end if;

  insert into public.appointments (
    clinic_id, doctor_id, patient_id, starts_at, ends_at, duration_min,
    status, source, reason, booked_by_call_id
  )
  values (
    p_clinic_id, p_doctor_id, v_patient_id, p_starts_at, v_ends_at, v_duration,
    'booked', p_source, p_reason, p_call_id
  )
  returning * into v_appt;

  insert into public.appointment_events (
    clinic_id, appointment_id, event, actor_type, actor_call_id, payload
  )
  values (
    p_clinic_id, v_appt.id, 'created',
    case when p_source = 'ai_call' then 'ai'::public.actor_type else 'staff'::public.actor_type end,
    p_call_id,
    jsonb_build_object('source', p_source, 'reason', p_reason)
  );

  return v_appt;
end;
$$;

-- ---------------------------------------------------------------------------
-- public.cancel_appointment / public.reschedule_appointment
-- ---------------------------------------------------------------------------
create or replace function public.cancel_appointment(
  p_appointment_id uuid,
  p_actor          public.actor_type default 'ai',
  p_reason         text default null,
  p_call_id        uuid default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments;
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if v_appt.id is null then
    raise exception 'Unknown appointment %', p_appointment_id using errcode = 'no_data_found';
  end if;
  perform sahva.assert_clinic_access(v_appt.clinic_id);

  if v_appt.status in ('completed','cancelled') then
    raise exception 'Appointment % is already %', p_appointment_id, v_appt.status
      using errcode = 'invalid_parameter_value';
  end if;

  -- The AI may only cancel where the clinic has explicitly opted in.
  if p_actor = 'ai' and not coalesce(
       (select ai_may_cancel from public.clinic_settings where clinic_id = v_appt.clinic_id), false)
  then
    raise exception 'AI cancellation is disabled for this clinic'
      using errcode = 'insufficient_privilege',
            hint = 'Raise an ai_escalation action item for staff instead.';
  end if;

  update public.appointments
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = p_actor,
         cancellation_reason = p_reason
   where id = p_appointment_id
  returning * into v_appt;

  insert into public.appointment_events (clinic_id, appointment_id, event, actor_type, actor_call_id, note)
  values (v_appt.clinic_id, v_appt.id, 'cancelled', p_actor, p_call_id, p_reason);

  return v_appt;
end;
$$;

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

revoke all on function public.get_available_slots(uuid, date) from public;
revoke all on function public.book_appointment(uuid, uuid, text, text, timestamptz, text, uuid, public.booking_source, public.language_code) from public;
revoke all on function public.cancel_appointment(uuid, public.actor_type, text, uuid) from public;
revoke all on function public.reschedule_appointment(uuid, timestamptz, uuid, public.actor_type, uuid) from public;

grant execute on function public.get_available_slots(uuid, date) to authenticated, service_role;
grant execute on function public.book_appointment(uuid, uuid, text, text, timestamptz, text, uuid, public.booking_source, public.language_code) to authenticated, service_role;
grant execute on function public.cancel_appointment(uuid, public.actor_type, text, uuid) to authenticated, service_role;
grant execute on function public.reschedule_appointment(uuid, timestamptz, uuid, public.actor_type, uuid) to authenticated, service_role;

comment on function public.book_appointment is
  'The only sanctioned write path for bookings. Re-checks live availability inside the transaction; the '
  'appointments EXCLUDE constraint catches anything that still races through.';
