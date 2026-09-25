-- ============================================================================
-- SAHVA · 0200 · Tenancy, staff membership, clinic configuration
-- ============================================================================

-- ---------------------------------------------------------------------------
-- clinics — the tenant root
-- ---------------------------------------------------------------------------
create table public.clinics (
  id                  uuid primary key default extensions.gen_random_uuid(),
  slug                text not null unique
                        check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  name                text not null check (length(btrim(name)) between 2 and 150),
  legal_name          text,

  -- The number patients dial. This is what telephony routes on, so it is the
  -- tenant-resolution key for every inbound call: UNIQUE and NOT NULL.
  phone_e164          text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_e164       text check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  support_email       extensions.citext,

  address_line        text,
  landmark            text,          -- Tier 2/3 addressing is landmark-first
  city                text not null,
  district            text,
  state               text,
  pincode             text check (pincode ~ '^[1-9][0-9]{5}$'),
  map_url             text,

  timezone            text not null default 'Asia/Kolkata',
  default_language    public.language_code not null default 'te',
  -- Small, bounded set read on every call; an array beats a join here.
  supported_languages public.language_code[] not null default '{te,en}'
                        check (array_length(supported_languages, 1) between 1 and 3),

  is_active           boolean not null default true,
  onboarded_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index clinics_active_idx on public.clinics (is_active) where is_active;

create trigger clinics_touch before update on public.clinics
  for each row execute function sahva.touch_updated_at();

comment on column public.clinics.phone_e164 is
  'The clinic''s public number. Telephony webhooks resolve the tenant from this — must stay unique.';
comment on column public.clinics.landmark is
  'Tier 2/3 patients navigate by landmark, not street address. The AI reads this out on location questions.';

-- ---------------------------------------------------------------------------
-- clinic_settings — 1:1 config, read by the voice agent on every single call
-- ---------------------------------------------------------------------------
create table public.clinic_settings (
  clinic_id                uuid primary key references public.clinics(id) on delete cascade,

  ai_enabled               boolean not null default true,
  ai_answers_after_hours   boolean not null default true,
  ai_may_book              boolean not null default true,
  ai_may_reschedule        boolean not null default true,
  ai_may_cancel            boolean not null default false,  -- off by default: cancels are high-trust

  slot_granularity_min     smallint not null default 15 check (slot_granularity_min in (5,10,15,20,30,60)),
  booking_horizon_days     smallint not null default 30  check (booking_horizon_days between 1 and 180),
  min_notice_minutes       smallint not null default 30  check (min_notice_minutes between 0 and 1440),
  cancellation_window_min  smallint not null default 120 check (cancellation_window_min >= 0),
  max_daily_ai_bookings    smallint check (max_daily_ai_bookings > 0),

  greeting_te              text,
  greeting_en              text,
  escalation_phone_e164    text check (escalation_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  escalation_keywords      text[] not null default '{emergency,accident,bleeding,chest pain,అత్యవసరం}',

  send_confirmations       boolean not null default true,
  send_reminders           boolean not null default true,
  reminder_hours_before    smallint not null default 18 check (reminder_hours_before between 1 and 72),

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger clinic_settings_touch before update on public.clinic_settings
  for each row execute function sahva.touch_updated_at();

comment on column public.clinic_settings.ai_may_cancel is
  'Default false. A wrongly cancelled medical appointment is the worst failure mode; staff opt in explicitly.';
comment on column public.clinic_settings.escalation_keywords is
  'If any appears in a transcript the AI stops scheduling and hands off to escalation_phone_e164.';

-- ---------------------------------------------------------------------------
-- clinic_hours / clinic_closures — when the building is open, independent of
-- which doctor is sitting. The AI answers "are you open?" from here.
-- ---------------------------------------------------------------------------
create table public.clinic_hours (
  id          uuid primary key default extensions.gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  opens_at    time not null,
  closes_at   time not null,
  label       text,                                                   -- 'Morning', 'Evening'
  check (closes_at > opens_at),
  unique (clinic_id, day_of_week, opens_at)
);
create index clinic_hours_clinic_idx on public.clinic_hours (clinic_id, day_of_week);

create table public.clinic_closures (
  id         uuid primary key default extensions.gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  starts_on  date not null,
  ends_on    date not null,
  reason     text not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index clinic_closures_range_idx on public.clinic_closures (clinic_id, starts_on, ends_on);

comment on table public.clinic_closures is
  'Festivals, Sankranti, doctor travel. Slot generation subtracts these before offering any time.';

-- ---------------------------------------------------------------------------
-- staff_profiles — 1:1 extension of auth.users
-- Not clinic-scoped: one person may later work across branches.
-- ---------------------------------------------------------------------------
create table public.staff_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null check (length(btrim(full_name)) between 2 and 100),
  phone_e164   text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  avatar_url   text,
  locale       public.language_code not null default 'en',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger staff_profiles_touch before update on public.staff_profiles
  for each row execute function sahva.touch_updated_at();

-- Auto-create the profile row when Supabase Auth creates a user.
create or replace function sahva.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.staff_profiles (id, full_name, phone_e164)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function sahva.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- clinic_members — the RLS anchor. Every access decision resolves through here.
-- ---------------------------------------------------------------------------
create table public.clinic_members (
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  staff_id    uuid not null references public.staff_profiles(id) on delete cascade,
  role        public.staff_role not null default 'receptionist',
  status      public.member_status not null default 'invited',
  invited_by  uuid references public.staff_profiles(id) on delete set null,
  invited_at  timestamptz not null default now(),
  joined_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (clinic_id, staff_id)
);

create index clinic_members_staff_idx  on public.clinic_members (staff_id) where status = 'active';
create index clinic_members_clinic_idx on public.clinic_members (clinic_id, role);

-- Exactly one active owner per clinic — prevents an orphaned or headless tenant.
create unique index clinic_members_single_owner_idx
  on public.clinic_members (clinic_id)
  where role = 'owner' and status = 'active';

create trigger clinic_members_touch before update on public.clinic_members
  for each row execute function sahva.touch_updated_at();

comment on table public.clinic_members is
  'Membership table that every RLS policy resolves through. RLS is deliberately NOT forced here so that the '
  'SECURITY DEFINER predicate helpers in schema sahva can read it without recursing into their own policy.';
