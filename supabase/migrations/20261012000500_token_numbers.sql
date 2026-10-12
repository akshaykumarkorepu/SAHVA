-- ============================================================================
-- SAHVA · OPD token numbers
--
-- appointments.token_number existed, and the dashboard, the portal views and
-- the patient record all read it, but nothing ever set it: every real booking
-- had no token. The only tokens anyone saw were typed into mock fixtures.
--
-- A token is the number a patient is called by in the waiting room. It is
-- assigned once, when the booking is made, per doctor per clinic-local day,
-- and never changes afterwards — a patient told "you are token 7" must still
-- be token 7 when they arrive, even if someone books an earlier slot later.
-- That is how an OPD token works; ordering by slot time is a separate thing
-- (the portal's "patients ahead" count does that).
-- ============================================================================

create or replace function sahva.assign_token_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz  text;
  v_day date;
begin
  if new.token_number is not null then
    return new;  -- an explicit token (imports, fixtures) is kept
  end if;

  select timezone into v_tz from public.clinics where id = new.clinic_id;
  v_day := (new.starts_at at time zone coalesce(v_tz, 'Asia/Kolkata'))::date;

  -- Two receptionists booking the same doctor at the same moment must not
  -- both get the next number. Serialise per doctor per day for this
  -- transaction only.
  perform pg_advisory_xact_lock(hashtext(new.doctor_id::text || v_day::text));

  select coalesce(max(a.token_number), 0) + 1
    into new.token_number
    from public.appointments a
   where a.doctor_id = new.doctor_id
     and (a.starts_at at time zone coalesce(v_tz, 'Asia/Kolkata'))::date = v_day;

  return new;
end;
$$;

create trigger appointments_assign_token
  before insert on public.appointments
  for each row execute function sahva.assign_token_number();

-- Existing appointments: number each doctor's day in booking order.
with numbered as (
  select a.id,
         row_number() over (
           partition by a.doctor_id, (a.starts_at at time zone c.timezone)::date
           order by a.created_at, a.starts_at, a.id
         ) as n
    from public.appointments a
    join public.clinics c on c.id = a.clinic_id
   where a.token_number is null
)
update public.appointments a
   set token_number = numbered.n
  from numbered
 where numbered.id = a.id;

comment on function sahva.assign_token_number is
  'Gives each new appointment the next OPD token for its doctor and clinic-local day. Stable once assigned.';
