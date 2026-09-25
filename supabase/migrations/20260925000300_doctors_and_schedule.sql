-- ============================================================================
-- SAHVA · 0300 · Doctors, recurring sessions, time off
-- ============================================================================

create table public.doctors (
  id                    uuid primary key default extensions.gen_random_uuid(),
  clinic_id             uuid not null references public.clinics(id) on delete cascade,

  full_name             text not null check (length(btrim(full_name)) between 2 and 100),
  -- What the AI actually says out loud. "Dr. Anitha" not "Dr. Anitha Reddy, MBBS, MD".
  spoken_name           text not null check (length(btrim(spoken_name)) between 2 and 60),
  specialty             text not null,
  qualifications        text,
  registration_no       text,
  phone_e164            text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),

  languages             public.language_code[] not null default '{te,en}'
                          check (array_length(languages, 1) between 1 and 3),
  consult_duration_min  smallint not null default 15 check (consult_duration_min between 5 and 120),
  consult_fee_paise     integer check (consult_fee_paise >= 0),
  followup_fee_paise    integer check (followup_fee_paise >= 0),

  -- Optional login, so the doctor can dictate notes in Phase 2.
  staff_id              uuid references public.staff_profiles(id) on delete set null,

  colour_hex            text not null default '#2F6BFF' check (colour_hex ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order            smallint not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Target for composite FKs: guarantees a child row can never pair this
  -- doctor with a different clinic_id.
  unique (id, clinic_id)
);

create index doctors_clinic_idx     on public.doctors (clinic_id, sort_order) where is_active;
create index doctors_languages_idx  on public.doctors using gin (languages);
create unique index doctors_staff_idx on public.doctors (staff_id) where staff_id is not null;

create trigger doctors_touch before update on public.doctors
  for each row execute function sahva.touch_updated_at();

comment on column public.doctors.spoken_name is
  'Short form the TTS reads aloud. Kept separate from full_name so titles and degrees never end up in speech.';
comment on column public.doctors.consult_fee_paise is
  'Paise, integer. "What are the fees?" is the single most common FAQ — it is answered from this column, not the KB.';

-- ---------------------------------------------------------------------------
-- doctor_sessions — recurring weekly availability.
-- One row per (doctor, weekday, block): morning and evening are two rows, so
-- split shifts and "Dr. X only does paediatrics on Tuesday" fall out naturally.
-- effective_from/to make schedule changes non-destructive and auditable.
-- ---------------------------------------------------------------------------
create table public.doctor_sessions (
  id                uuid primary key default extensions.gen_random_uuid(),
  clinic_id         uuid not null,
  doctor_id         uuid not null,

  day_of_week       smallint not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  starts_at         time not null,
  ends_at           time not null,
  slot_duration_min smallint check (slot_duration_min between 5 and 120),   -- null → doctor default
  capacity_per_slot smallint not null default 1 check (capacity_per_slot between 1 and 10),
  label             text,

  effective_from    date not null default current_date,
  effective_to      date,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  check (ends_at > starts_at),
  check (effective_to is null or effective_to >= effective_from),
  unique (doctor_id, day_of_week, starts_at, effective_from),
  foreign key (doctor_id, clinic_id)
    references public.doctors(id, clinic_id) on delete cascade
);

create index doctor_sessions_lookup_idx
  on public.doctor_sessions (doctor_id, day_of_week, effective_from, effective_to)
  where is_active;
create index doctor_sessions_clinic_idx on public.doctor_sessions (clinic_id) where is_active;

create trigger doctor_sessions_touch before update on public.doctor_sessions
  for each row execute function sahva.touch_updated_at();

comment on table public.doctor_sessions is
  'Recurring weekly consulting blocks. Slot generation reads only from here — the AI never memorises hours.';
comment on column public.doctor_sessions.capacity_per_slot is
  'Many Indian clinics overbook a slot by design (token system). Capacity > 1 models that honestly instead of '
  'pretending each slot holds one patient and then double-booking behind the schema''s back.';

-- ---------------------------------------------------------------------------
-- doctor_time_off — the exception that triggers the Action Required flow.
-- Inserting a row here NEVER silently cancels anything (see migration 0700).
-- ---------------------------------------------------------------------------
create table public.doctor_time_off (
  id             uuid primary key default extensions.gen_random_uuid(),
  clinic_id      uuid not null,
  doctor_id      uuid not null,

  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  kind           public.time_off_kind not null default 'leave',
  reason         text,

  created_by     uuid references public.staff_profiles(id) on delete set null,
  -- Set by the trigger once affected appointments have been swept into a batch.
  processed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  check (ends_at > starts_at),
  foreign key (doctor_id, clinic_id)
    references public.doctors(id, clinic_id) on delete cascade,

  -- A doctor cannot be on two overlapping kinds of leave.
  constraint doctor_time_off_no_overlap exclude using gist (
    doctor_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
);

create index doctor_time_off_window_idx on public.doctor_time_off (clinic_id, starts_at, ends_at);
create index doctor_time_off_unprocessed_idx
  on public.doctor_time_off (clinic_id) where processed_at is null;

create trigger doctor_time_off_touch before update on public.doctor_time_off
  for each row execute function sahva.touch_updated_at();

comment on table public.doctor_time_off is
  'The trust mechanism''s entry point. A row here flags affected appointments as needs_reschedule and opens an '
  'action item — it never cancels a patient, and the AI is never told to guess a replacement slot.';
