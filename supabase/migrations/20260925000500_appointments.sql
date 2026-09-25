-- ============================================================================
-- SAHVA · 0500 · Appointments and their audit trail
-- ============================================================================

create table public.appointments (
  id                   uuid primary key default extensions.gen_random_uuid(),
  clinic_id            uuid not null references public.clinics(id) on delete cascade,
  doctor_id            uuid not null,
  patient_id           uuid not null,

  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  duration_min         smallint not null check (duration_min between 5 and 240),

  status               public.appointment_status not null default 'booked',
  source               public.booking_source not null default 'ai_call',
  reason               text,
  token_number         smallint check (token_number > 0),
  notes                text,

  -- Provenance: which call produced this, and what it replaced.
  booked_by_call_id    uuid,                                        -- FK added in 0600
  booked_by_staff_id   uuid references public.staff_profiles(id) on delete set null,
  rescheduled_from_id  uuid references public.appointments(id) on delete set null,

  confirmed_at         timestamptz,
  checked_in_at        timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         public.actor_type,
  cancellation_reason  text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  check (ends_at > starts_at),
  -- Keeps the three time columns from ever drifting apart.
  check (ends_at = starts_at + make_interval(mins => duration_min)),
  -- A cancellation must say who did it. No anonymous cancellations, ever.
  check (
    (status <> 'cancelled')
    or (cancelled_at is not null and cancelled_by is not null)
  ),

  unique (id, clinic_id),
  foreign key (doctor_id, clinic_id)  references public.doctors(id, clinic_id)  on delete restrict,
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- The single most important constraint in this schema.
-- Double-booking is made structurally impossible for live appointments, so an
-- AI hallucination, a race between two simultaneous calls, or a buggy client
-- all fail at the database rather than at the front desk on the day.
-- Cancelled / no-show / needs_reschedule rows are excluded so a freed slot is
-- immediately rebookable.
-- NOTE: capacity_per_slot > 1 clinics must drop this and rely on
--       sahva.available_slots() counting instead (see docs/data-model.md).
-- ---------------------------------------------------------------------------
alter table public.appointments
  add constraint appointments_no_double_booking
  exclude using gist (
    doctor_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('booked', 'confirmed', 'checked_in'));

create index appointments_clinic_time_idx  on public.appointments (clinic_id, starts_at desc);
create index appointments_doctor_time_idx  on public.appointments (doctor_id, starts_at);
create index appointments_patient_idx      on public.appointments (patient_id, starts_at desc);
create index appointments_status_idx       on public.appointments (clinic_id, status, starts_at);
create index appointments_call_idx         on public.appointments (booked_by_call_id)
  where booked_by_call_id is not null;
-- Powers the Action Required badge without scanning history.
create index appointments_needs_reschedule_idx
  on public.appointments (clinic_id, starts_at)
  where status = 'needs_reschedule';

create trigger appointments_touch before update on public.appointments
  for each row execute function sahva.touch_updated_at();

comment on constraint appointments_no_double_booking on public.appointments is
  'Architecture principle: the AI decides what it wants to do, the database decides what is actually allowed.';

-- ---------------------------------------------------------------------------
-- appointment_events — append-only. This is the evidence that nothing was
-- changed behind a patient''s back, which is the product''s core promise.
-- ---------------------------------------------------------------------------
create table public.appointment_events (
  id              uuid primary key default extensions.gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  appointment_id  uuid not null references public.appointments(id) on delete cascade,

  event           public.appointment_event not null,
  actor_type      public.actor_type not null,
  actor_staff_id  uuid references public.staff_profiles(id) on delete set null,
  actor_call_id   uuid,                                       -- FK added in 0600
  note            text,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index appointment_events_appt_idx   on public.appointment_events (appointment_id, created_at desc);
create index appointment_events_clinic_idx on public.appointment_events (clinic_id, created_at desc);

-- Enforce append-only at the database, not by convention.
create or replace function sahva.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Table %.% is append-only; % is not permitted',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger appointment_events_append_only
  before update or delete on public.appointment_events
  for each row execute function sahva.reject_mutation();

comment on table public.appointment_events is
  'Append-only audit log. Updates and deletes are rejected by trigger so the reschedule history cannot be edited.';
