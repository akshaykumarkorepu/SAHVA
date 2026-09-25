-- ============================================================================
-- SAHVA · 0900 · WhatsApp / SMS templates and delivery log
-- ============================================================================

create table public.message_templates (
  id                     uuid primary key default extensions.gen_random_uuid(),
  -- NULL clinic_id = Sahva-provided default that every clinic inherits.
  clinic_id              uuid references public.clinics(id) on delete cascade,

  key                    text not null check (key ~ '^[a-z][a-z0-9_]{2,48}$'),
  channel                public.message_channel not null,
  language               public.language_code not null,
  body                   text not null,
  -- Meta requires pre-approved templates; store the approved name per language.
  provider_template_name text,
  variables              text[] not null default '{}',
  is_active              boolean not null default true,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Two partial uniques: NULLs do not collide in a plain UNIQUE, so the global
-- defaults need their own index to stay unique.
create unique index message_templates_clinic_idx
  on public.message_templates (clinic_id, key, channel, language)
  where clinic_id is not null;
create unique index message_templates_global_idx
  on public.message_templates (key, channel, language)
  where clinic_id is null;

create trigger message_templates_touch before update on public.message_templates
  for each row execute function sahva.touch_updated_at();

comment on table public.message_templates is
  'Clinic row overrides the global row with the same (key, channel, language). Resolution is clinic-first.';

-- ---------------------------------------------------------------------------
-- messages — the delivery log. body_rendered is stored, not re-derived, so the
-- record of what a patient was actually told survives template edits.
-- ---------------------------------------------------------------------------
create table public.messages (
  id                   uuid primary key default extensions.gen_random_uuid(),
  clinic_id            uuid not null references public.clinics(id) on delete cascade,
  patient_id           uuid references public.patients(id)     on delete set null,
  appointment_id       uuid references public.appointments(id) on delete set null,
  batch_item_id        uuid references public.reschedule_batch_items(id) on delete set null,

  channel              public.message_channel not null,
  direction            public.message_direction not null default 'outbound',
  to_e164              text not null check (to_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  template_key         text,
  language             public.language_code,
  body_rendered        text not null,

  status               public.message_status not null default 'queued',
  provider             text,
  provider_message_id  text,
  error_code           text,
  error_detail         text,

  scheduled_for        timestamptz,
  sent_at              timestamptz,
  delivered_at         timestamptz,
  read_at              timestamptz,
  failed_at            timestamptz,
  cost_paise           numeric(10,4) check (cost_paise >= 0),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  check (status <> 'failed' or (failed_at is not null and error_code is not null))
);

create unique index messages_provider_id_idx
  on public.messages (provider, provider_message_id)
  where provider_message_id is not null;

create index messages_clinic_idx      on public.messages (clinic_id, created_at desc);
create index messages_appointment_idx on public.messages (appointment_id) where appointment_id is not null;
create index messages_due_idx         on public.messages (scheduled_for) where status = 'queued';
create index messages_failed_idx      on public.messages (clinic_id, failed_at desc) where status = 'failed';

create trigger messages_touch before update on public.messages
  for each row execute function sahva.touch_updated_at();

alter table public.reschedule_batch_items
  add constraint reschedule_batch_items_message_fkey
  foreign key (message_id) references public.messages(id) on delete set null;

comment on column public.messages.body_rendered is
  'The exact text sent. Stored rather than regenerated so a later template edit cannot rewrite history.';
