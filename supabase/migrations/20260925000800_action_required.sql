-- ============================================================================
-- SAHVA · 0800 · The Action Required queue and mass reschedule flow
-- The most differentiated part of the product. A doctor becoming unavailable
-- must never silently drop a patient: it produces work for a human instead.
-- ============================================================================

create table public.action_items (
  id                    uuid primary key default extensions.gen_random_uuid(),
  clinic_id             uuid not null references public.clinics(id) on delete cascade,

  type                  public.action_type not null,
  severity              public.action_severity not null default 'normal',
  status                public.action_status not null default 'open',

  title                 text not null,
  description           text,
  payload               jsonb not null default '{}'::jsonb,

  related_appointment_id uuid references public.appointments(id)   on delete cascade,
  related_call_id        uuid references public.calls(id)          on delete cascade,
  related_doctor_id      uuid references public.doctors(id)        on delete cascade,
  related_patient_id     uuid references public.patients(id)       on delete cascade,
  related_batch_id       uuid,                                      -- FK added below

  due_by                timestamptz,
  assigned_to           uuid references public.staff_profiles(id) on delete set null,
  resolved_by           uuid references public.staff_profiles(id) on delete set null,
  resolved_at           timestamptz,
  resolution_note       text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  check (status not in ('resolved','dismissed') or resolved_at is not null)
);

-- The dashboard badge: open items, worst first. Partial index keeps it O(open).
create index action_items_open_idx
  on public.action_items (clinic_id, severity desc, created_at)
  where status in ('open','in_progress');
create index action_items_assignee_idx
  on public.action_items (assigned_to, status) where assigned_to is not null;
create index action_items_appt_idx
  on public.action_items (related_appointment_id) where related_appointment_id is not null;

-- One open item per appointment per type: re-running the sweep must not spam
-- the queue with duplicates.
create unique index action_items_dedupe_idx
  on public.action_items (clinic_id, type, related_appointment_id)
  where status in ('open','in_progress') and related_appointment_id is not null;

create trigger action_items_touch before update on public.action_items
  for each row execute function sahva.touch_updated_at();

-- ---------------------------------------------------------------------------
-- reschedule_batches — staff review one list, then trigger one mass send.
-- ---------------------------------------------------------------------------
create table public.reschedule_batches (
  id              uuid primary key default extensions.gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  doctor_id       uuid not null references public.doctors(id) on delete cascade,
  time_off_id     uuid references public.doctor_time_off(id) on delete set null,

  window_start    timestamptz not null,
  window_end      timestamptz not null,
  status          public.batch_status not null default 'draft',
  reason_note     text,

  total_affected  integer not null default 0 check (total_affected  >= 0),
  notified_count  integer not null default 0 check (notified_count  >= 0),
  rebooked_count  integer not null default 0 check (rebooked_count  >= 0),

  created_by      uuid references public.staff_profiles(id) on delete set null,
  dispatched_by   uuid references public.staff_profiles(id) on delete set null,
  dispatched_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check (window_end > window_start),
  -- A batch only leaves draft when a human pressed send.
  constraint reschedule_batches_human_dispatch check (
    status = 'draft' or (dispatched_at is not null and dispatched_by is not null)
  )
);

create index reschedule_batches_clinic_idx on public.reschedule_batches (clinic_id, created_at desc);
create index reschedule_batches_open_idx   on public.reschedule_batches (clinic_id) where status = 'draft';

create trigger reschedule_batches_touch before update on public.reschedule_batches
  for each row execute function sahva.touch_updated_at();

alter table public.action_items
  add constraint action_items_batch_fkey
  foreign key (related_batch_id) references public.reschedule_batches(id) on delete cascade;

comment on constraint reschedule_batches_human_dispatch on public.reschedule_batches is
  'A batch cannot leave draft without a named human dispatcher. Automated mass messaging to patients is not '
  'something the system is permitted to do on its own.';

-- ---------------------------------------------------------------------------
-- reschedule_batch_items — one affected patient, tracked to resolution.
-- ---------------------------------------------------------------------------
create table public.reschedule_batch_items (
  id                  uuid primary key default extensions.gen_random_uuid(),
  clinic_id           uuid not null references public.clinics(id) on delete cascade,
  batch_id            uuid not null references public.reschedule_batches(id) on delete cascade,
  appointment_id      uuid not null references public.appointments(id) on delete cascade,
  patient_id          uuid not null references public.patients(id) on delete cascade,

  status              public.batch_item_status not null default 'pending',
  new_appointment_id  uuid references public.appointments(id) on delete set null,
  message_id          uuid,                                   -- FK added in 0900
  attempts            smallint not null default 0 check (attempts >= 0),
  last_error          text,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (batch_id, appointment_id)
);

create index reschedule_batch_items_batch_idx on public.reschedule_batch_items (batch_id, status);
create index reschedule_batch_items_pending_idx
  on public.reschedule_batch_items (clinic_id) where status = 'pending';

create trigger reschedule_batch_items_touch before update on public.reschedule_batch_items
  for each row execute function sahva.touch_updated_at();
