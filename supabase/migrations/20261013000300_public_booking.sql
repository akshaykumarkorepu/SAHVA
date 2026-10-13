-- ============================================================================
-- SAHVA · Public booking page, with call-back confirmation
--
-- Each live clinic has a public page (/c/<slug>) showing its doctors and
-- timings. Someone who has never visited can request a free slot with their
-- name and mobile number. Until SMS one-time codes exist, the number is not
-- proven, so the request:
--   * really holds the slot (booked through book_appointment, source 'web'),
--   * is marked phone_verified = false,
--   * raises an urgent Action Required item: "call to confirm".
-- Confirming the appointment (the clinic's normal Confirm) verifies it and
-- resolves the item; cancelling dismisses it. A request nobody confirms is
-- released automatically after 24 hours, or 1 hour before the slot.
--
-- Abuse limits, in the database so no client can skip them: 2 hours' notice
-- at least, 14 days ahead at most, one open request per phone per clinic,
-- 20 unconfirmed requests per clinic per day.
-- ============================================================================

alter table public.clinic_settings
  add column public_booking_enabled boolean not null default true;
comment on column public.clinic_settings.public_booking_enabled is
  'The clinic''s public page takes booking requests from new patients (confirmed by call-back).';

alter table public.appointments
  add column phone_verified boolean not null default true;
comment on column public.appointments.phone_verified is
  'False for requests from the public page until the clinic confirms by phone.';
create index appointments_unverified_idx on public.appointments (clinic_id, created_at)
  where not phone_verified and status = 'booked';

/**
 * Request a slot from the public page. Service role only (the API calls it
 * after its own rate limit). Returns the held appointment.
 */
create or replace function public.request_public_booking(
  p_clinic_id uuid, p_doctor_id uuid, p_name text, p_phone text, p_starts_at timestamptz, p_reason text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt    public.appointments;
  v_doctor  public.doctors;
  v_enabled boolean;
begin
  select public_booking_enabled into v_enabled from public.clinic_settings where clinic_id = p_clinic_id;
  if not coalesce(v_enabled, true) or not sahva.clinic_is_live(p_clinic_id) then
    raise exception 'This clinic is not taking online requests' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 or p_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'A name and an Indian mobile number are needed' using errcode = 'invalid_parameter_value';
  end if;
  if p_starts_at < now() + interval '2 hours' or p_starts_at > now() + interval '14 days' then
    raise exception 'Online requests are for 2 hours to 14 days ahead' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.appointments a join public.patients p on p.id = a.patient_id
              where a.clinic_id = p_clinic_id and p.phone_e164 = p_phone and not a.phone_verified
                and a.status = 'booked' and a.starts_at > now()) then
    raise exception 'There is already a request waiting for this number' using errcode = 'unique_violation';
  end if;
  if (select count(*) from public.appointments
       where clinic_id = p_clinic_id and not phone_verified and created_at > now() - interval '1 day') >= 20 then
    raise exception 'This clinic has too many unconfirmed requests today; please call' using errcode = 'insufficient_privilege';
  end if;

  v_appt := public.book_appointment(p_clinic_id, p_doctor_id, btrim(p_name), p_phone, p_starts_at,
                                    nullif(btrim(p_reason), ''), null, 'web', null);
  update public.appointments set phone_verified = false where id = v_appt.id returning * into v_appt;

  select * into v_doctor from public.doctors where id = p_doctor_id;
  insert into public.action_items (clinic_id, type, severity, title, description, payload,
                                   related_appointment_id, related_patient_id, related_doctor_id, due_by)
  values (p_clinic_id, 'online_request', 'high',
          'Online request — call ' || btrim(p_name) || ' to confirm',
          'Booked from the clinic''s public page for ' || v_doctor.full_name
            || '. The number is not verified: call it, then Confirm the appointment (or cancel it).',
          jsonb_build_object('phone', p_phone, 'name', btrim(p_name), 'starts_at', p_starts_at),
          v_appt.id, v_appt.patient_id, p_doctor_id,
          least(now() + interval '2 hours', p_starts_at - interval '1 hour'));
  return v_appt;
end;
$$;
revoke all on function public.request_public_booking(uuid, uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.request_public_booking(uuid, uuid, text, text, timestamptz, text) to service_role;

-- Confirming verifies; cancelling (or finishing) closes the call-back item.
create or replace function sahva.verify_on_confirm()
returns trigger
language plpgsql
as $$
begin
  if not new.phone_verified and new.status in ('confirmed', 'checked_in', 'completed') then
    new.phone_verified := true;
  end if;
  return new;
end;
$$;
create trigger appointments_verify_on_confirm
  before update of status on public.appointments
  for each row execute function sahva.verify_on_confirm();

create or replace function sahva.close_online_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('confirmed', 'checked_in', 'completed', 'cancelled') then
    update public.action_items
       set status = case when new.status = 'cancelled' then 'dismissed' else 'resolved' end::public.action_status,
           resolved_at = now(),
           resolution_note = case when new.status = 'cancelled' then 'Request cancelled' else 'Confirmed with the patient' end
     where related_appointment_id = new.id and type = 'online_request' and status in ('open', 'in_progress');
  end if;
  return null;
end;
$$;
create trigger appointments_close_online_request
  after update of status on public.appointments
  for each row execute function sahva.close_online_request();

/**
 * Release requests nobody confirmed: 24 hours after the request, or 1 hour
 * before the slot, whichever comes first. Run by the scheduled job.
 */
create or replace function public.expire_unverified_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  with gone as (
    update public.appointments
       set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system',
           cancellation_reason = 'Online request not confirmed in time'
     where not phone_verified and status = 'booked'
       and (created_at < now() - interval '24 hours' or starts_at < now() + interval '1 hour')
    returning id)
  select count(*) into v_n from gone;
  return v_n;
end;
$$;
revoke all on function public.expire_unverified_bookings() from public, anon, authenticated;
grant execute on function public.expire_unverified_bookings() to service_role;

/** The public page's clinic: found by slug, and only while approved and live. */
create or replace function public.public_clinic_by_slug(p_slug text)
returns table (id uuid, live boolean, requests_enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, sahva.clinic_is_live(c.id),
         sahva.clinic_is_live(c.id) and coalesce(s.public_booking_enabled, true)
    from public.clinics c
    left join public.clinic_settings s on s.clinic_id = c.id
   where c.slug = lower(p_slug) and c.verification_status = 'approved';
$$;
revoke all on function public.public_clinic_by_slug(text) from public, anon, authenticated;
grant execute on function public.public_clinic_by_slug(text) to service_role;
