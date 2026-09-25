-- ============================================================================
-- SAHVA · 0400 · Patients
-- ============================================================================

create table public.patients (
  id                  uuid primary key default extensions.gen_random_uuid(),
  clinic_id           uuid not null references public.clinics(id) on delete cascade,

  full_name           text not null check (length(btrim(full_name)) between 1 and 100),
  phone_e164          text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  alt_phone_e164      text check (alt_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),

  date_of_birth       date check (date_of_birth <= current_date),
  -- Captured when the caller knows an age but not a birth date, which is the
  -- common case on the phone. Independent fact, not derivable from DOB.
  approx_age_years    smallint check (approx_age_years between 0 and 130),
  sex                 public.sex not null default 'unknown',

  preferred_language  public.language_code not null default 'te',
  address_line        text,
  landmark            text,
  notes               text,

  is_blocked          boolean not null default false,   -- repeat prank / abusive callers
  first_seen_via      public.booking_source not null default 'ai_call',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (id, clinic_id)
);

-- One phone number legitimately covers a whole family — a mother books for two
-- children on her handset, which is the norm in paediatrics (a target specialty).
-- So identity is (clinic, phone, normalised name), NOT (clinic, phone).
create unique index patients_identity_idx
  on public.patients (clinic_id, phone_e164, lower(btrim(full_name)));

-- Caller lookup on an inbound call: resolve every family member on the number.
create index patients_phone_idx on public.patients (clinic_id, phone_e164);
create index patients_name_trgm_idx on public.patients (clinic_id, lower(full_name));

create trigger patients_touch before update on public.patients
  for each row execute function sahva.touch_updated_at();

comment on index public.patients_identity_idx is
  'Deliberately NOT unique on (clinic_id, phone_e164): one handset serves a family. Uniqueness includes the '
  'normalised name so "Ravi" and "Ravi''s son Aarav" are distinct patients on the same number.';
comment on column public.patients.approx_age_years is
  'Phone callers routinely give an age, not a DOB. Stored separately rather than fabricating a birth date.';
