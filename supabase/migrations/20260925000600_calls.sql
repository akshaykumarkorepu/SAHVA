-- ============================================================================
-- SAHVA · 0600 · Calls, turns, tool invocations, summaries
-- ============================================================================

create table public.calls (
  id                   uuid primary key default extensions.gen_random_uuid(),
  clinic_id            uuid not null references public.clinics(id) on delete cascade,

  provider             public.telephony_provider not null default 'exotel',
  provider_call_sid    text,
  direction            public.call_direction not null default 'inbound',
  from_e164            text not null,
  to_e164              text not null,

  -- Null until the caller is identified; a missed call never gets one.
  patient_id           uuid,

  started_at           timestamptz not null default now(),
  answered_at          timestamptz,
  ended_at             timestamptz,
  duration_sec         integer check (duration_sec >= 0),

  status               public.call_status not null default 'in_progress',
  outcome              public.call_outcome,
  intent               public.call_intent,

  primary_language     public.language_code,
  -- Code-switching mid-call is the norm here; record every language observed.
  languages_detected   public.language_code[] not null default '{}',

  -- Mean STT confidence across caller turns. Low values open an action item
  -- rather than quietly trusting a possibly-misheard booking.
  stt_confidence_avg   numeric(4,3) check (stt_confidence_avg between 0 and 1),
  recording_url        text,
  escalated_to_human   boolean not null default false,
  -- True when the clinic would have missed this call: outside clinic_hours, or
  -- while the human line was busy. This is the number the case study is built on.
  recovered_missed     boolean not null default false,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  check (ended_at is null or ended_at >= started_at),
  check (answered_at is null or answered_at >= started_at),
  check (status <> 'completed' or ended_at is not null),

  unique (id, clinic_id),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete set null
);

-- Telephony retries deliver the same SID twice; make the webhook idempotent.
create unique index calls_provider_sid_idx
  on public.calls (provider, provider_call_sid)
  where provider_call_sid is not null;

create index calls_clinic_time_idx on public.calls (clinic_id, started_at desc);
create index calls_outcome_idx     on public.calls (clinic_id, outcome, started_at desc);
create index calls_from_idx        on public.calls (clinic_id, from_e164, started_at desc);
create index calls_recovered_idx   on public.calls (clinic_id, started_at) where recovered_missed;

create trigger calls_touch before update on public.calls
  for each row execute function sahva.touch_updated_at();

comment on column public.calls.recovered_missed is
  'Drives the headline pitch metric ("recovered 34 missed calls in 30 days"). Set when the call arrived outside '
  'clinic_hours or while the human line was engaged — i.e. it would have gone unanswered without Sahva.';

-- Deferred FKs from migration 0500, now that public.calls exists.
alter table public.appointments
  add constraint appointments_booked_by_call_fkey
  foreign key (booked_by_call_id) references public.calls(id) on delete set null;

alter table public.appointment_events
  add constraint appointment_events_actor_call_fkey
  foreign key (actor_call_id) references public.calls(id) on delete set null;

-- ---------------------------------------------------------------------------
-- call_turns — one row per utterance. A JSON transcript blob would have been
-- easier, but this is the Telugu ASR training corpus: it must be queryable by
-- language, confidence and latency to fix accent accuracy later.
-- ---------------------------------------------------------------------------
create table public.call_turns (
  id              uuid primary key default extensions.gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  call_id         uuid not null references public.calls(id) on delete cascade,

  turn_index      smallint not null check (turn_index >= 0),
  role            public.turn_role not null,
  content         text not null,
  language        public.language_code,
  stt_confidence  numeric(4,3) check (stt_confidence between 0 and 1),
  -- End of caller speech → first byte of TTS. The number that decides whether
  -- the conversation feels human; budget is ~1200ms.
  latency_ms      integer check (latency_ms >= 0),
  audio_url       text,
  started_at      timestamptz not null default now(),

  unique (call_id, turn_index)
);

create index call_turns_call_idx on public.call_turns (call_id, turn_index);
create index call_turns_lowconf_idx
  on public.call_turns (clinic_id, stt_confidence)
  where role = 'caller' and stt_confidence < 0.70;

create trigger call_turns_append_only
  before update or delete on public.call_turns
  for each row execute function sahva.reject_mutation();

-- ---------------------------------------------------------------------------
-- call_tool_invocations — what the model ASKED for versus what the backend
-- ALLOWED. Every rejected booking is preserved here with its reason, which is
-- how "the AI wanted to double-book and was stopped" becomes provable.
-- ---------------------------------------------------------------------------
create table public.call_tool_invocations (
  id             uuid primary key default extensions.gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  call_id        uuid not null references public.calls(id) on delete cascade,
  turn_id        uuid references public.call_turns(id) on delete set null,

  tool_name      text not null,
  arguments      jsonb not null default '{}'::jsonb,
  allowed        boolean not null,
  denial_reason  text,
  result         jsonb,
  latency_ms     integer check (latency_ms >= 0),
  created_at     timestamptz not null default now(),

  check (allowed or denial_reason is not null)
);

create index call_tool_invocations_call_idx on public.call_tool_invocations (call_id, created_at);
create index call_tool_invocations_denied_idx
  on public.call_tool_invocations (clinic_id, tool_name, created_at desc)
  where not allowed;

comment on table public.call_tool_invocations is
  'The audit seam between model intent and database authority. Denied rows are the evidence that the guard rails '
  'fire; they also feed the booking_conflict action item.';

-- ---------------------------------------------------------------------------
-- call_summaries — 1:1, split out because most missed calls never get one.
-- ---------------------------------------------------------------------------
create table public.call_summaries (
  call_id           uuid primary key references public.calls(id) on delete cascade,
  clinic_id         uuid not null references public.clinics(id) on delete cascade,
  summary_en        text,
  summary_te        text,
  follow_up_needed  boolean not null default false,
  created_at        timestamptz not null default now()
);

create index call_summaries_followup_idx
  on public.call_summaries (clinic_id) where follow_up_needed;
