-- ============================================================================
-- SAHVA · 1100 · Phase 2 — clinical notes, patient timeline, care loops,
--                 patient invoicing.
-- Created now so Phase 1 writes (appointments, patients) already carry the
-- keys Phase 2 needs. Nothing here is on the Phase 1 critical path.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- consultations — the dictated visit note. Raw transcript is kept beside the
-- formatted note: a doctor must always be able to see what they actually said
-- before the model tidied it.
-- ---------------------------------------------------------------------------
create table public.consultations (
  id                 uuid primary key default extensions.gen_random_uuid(),
  clinic_id          uuid not null references public.clinics(id) on delete cascade,
  appointment_id     uuid unique references public.appointments(id) on delete set null,
  patient_id         uuid not null,
  doctor_id          uuid not null,

  chief_complaint    text,
  findings           text,
  diagnosis_text     text,
  advice             text,
  follow_up_days     smallint check (follow_up_days between 0 and 365),

  dictation_audio_url text,
  dictated_language   public.language_code,
  raw_transcript      text,
  formatted_note      text,

  status             public.note_status not null default 'draft',
  finalised_at       timestamptz,
  finalised_by       uuid references public.staff_profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  check (status <> 'finalised' or finalised_at is not null),
  unique (id, clinic_id),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete cascade,
  foreign key (doctor_id, clinic_id)  references public.doctors(id, clinic_id)  on delete restrict
);

create index consultations_patient_idx on public.consultations (patient_id, created_at desc);
create index consultations_doctor_idx  on public.consultations (doctor_id, created_at desc);
create index consultations_draft_idx   on public.consultations (clinic_id) where status = 'draft';

create trigger consultations_touch before update on public.consultations
  for each row execute function sahva.touch_updated_at();

comment on column public.consultations.raw_transcript is
  'Verbatim dictation. Never overwritten by formatted_note — the doctor''s own words remain inspectable.';

-- ---------------------------------------------------------------------------
-- Prescriptions. One row per drug, never a free-text blob, so refill reminders
-- and interaction checks have something structured to read.
-- ---------------------------------------------------------------------------
create table public.prescriptions (
  id               uuid primary key default extensions.gen_random_uuid(),
  clinic_id        uuid not null references public.clinics(id) on delete cascade,
  consultation_id  uuid references public.consultations(id) on delete cascade,
  patient_id       uuid not null,
  doctor_id        uuid not null,
  issued_at        timestamptz not null default now(),
  notes            text,
  created_at       timestamptz not null default now(),

  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete cascade,
  foreign key (doctor_id, clinic_id)  references public.doctors(id, clinic_id)  on delete restrict
);

create index prescriptions_patient_idx on public.prescriptions (patient_id, issued_at desc);

create table public.prescription_items (
  id               uuid primary key default extensions.gen_random_uuid(),
  prescription_id  uuid not null references public.prescriptions(id) on delete cascade,
  drug_name        text not null,
  strength         text,
  form             text,                     -- tablet, syrup, drops
  dosage           text,                     -- '1-0-1'
  frequency        text,
  duration_days    smallint check (duration_days between 1 and 365),
  instructions_en  text,
  instructions_te  text,
  sort_order       smallint not null default 0
);

create index prescription_items_rx_idx on public.prescription_items (prescription_id, sort_order);

-- ---------------------------------------------------------------------------
-- patient_conditions — the timeline that makes a follow-up call intelligent.
-- ---------------------------------------------------------------------------
create table public.patient_conditions (
  id             uuid primary key default extensions.gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  patient_id     uuid not null,
  condition      text not null,
  icd10_code     text,
  status         public.condition_status not null default 'active',
  onset_date     date,
  resolved_date  date,
  noted_by       uuid references public.doctors(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  check (resolved_date is null or onset_date is null or resolved_date >= onset_date),
  check (status <> 'resolved' or resolved_date is not null),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete cascade
);

create index patient_conditions_patient_idx on public.patient_conditions (patient_id, status);
create index patient_conditions_chronic_idx
  on public.patient_conditions (clinic_id) where status = 'chronic';

create trigger patient_conditions_touch before update on public.patient_conditions
  for each row execute function sahva.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Vaccinations. The catalogue is national (IAP schedule), shared by all
-- clinics; only the administration record is tenant data.
-- ---------------------------------------------------------------------------
create table public.vaccine_catalogue (
  code                 text primary key,
  name                 text not null,
  description          text,
  recommended_age_weeks smallint check (recommended_age_weeks >= 0),
  dose_number          smallint not null default 1 check (dose_number between 1 and 10),
  is_active            boolean not null default true,
  sort_order           smallint not null default 0
);

create table public.patient_vaccinations (
  id               uuid primary key default extensions.gen_random_uuid(),
  clinic_id        uuid not null references public.clinics(id) on delete cascade,
  patient_id       uuid not null,
  vaccine_code     text not null references public.vaccine_catalogue(code),
  dose_number      smallint not null default 1 check (dose_number between 1 and 10),

  due_date         date,
  administered_at  timestamptz,
  administered_by  uuid references public.doctors(id) on delete set null,
  batch_no         text,
  status           public.vaccination_status not null default 'due',
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  check (status <> 'administered' or administered_at is not null),
  unique (patient_id, vaccine_code, dose_number),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete cascade
);

create index patient_vaccinations_due_idx
  on public.patient_vaccinations (clinic_id, due_date)
  where status in ('due','overdue');

create trigger patient_vaccinations_touch before update on public.patient_vaccinations
  for each row execute function sahva.touch_updated_at();

comment on table public.patient_vaccinations is
  'Paediatric clinics are a primary target segment; a due-dose list is the highest-value automated care loop.';

-- ---------------------------------------------------------------------------
-- Care loops: a rule, and the concrete tasks it generates.
-- ---------------------------------------------------------------------------
create table public.care_plans (
  id            uuid primary key default extensions.gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  name          text not null,
  trigger       public.care_trigger not null,
  offset_days   smallint not null check (offset_days between -365 and 365),
  template_key  text not null,
  channel       public.message_channel not null default 'whatsapp',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index care_plans_name_idx on public.care_plans (clinic_id, lower(name));

create trigger care_plans_touch before update on public.care_plans
  for each row execute function sahva.touch_updated_at();

create table public.care_tasks (
  id            uuid primary key default extensions.gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  care_plan_id  uuid not null references public.care_plans(id) on delete cascade,
  patient_id    uuid not null,
  appointment_id uuid references public.appointments(id) on delete set null,

  due_on        date not null,
  status        public.care_task_status not null default 'pending',
  message_id    uuid references public.messages(id) on delete set null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (care_plan_id, patient_id, due_on),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete cascade
);

create index care_tasks_due_idx on public.care_tasks (clinic_id, due_on) where status = 'pending';

create trigger care_tasks_touch before update on public.care_tasks
  for each row execute function sahva.touch_updated_at();

-- ---------------------------------------------------------------------------
-- patient_invoices — what the clinic bills the patient.
-- ---------------------------------------------------------------------------
create table public.patient_invoices (
  id              uuid primary key default extensions.gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  patient_id      uuid not null,
  appointment_id  uuid references public.appointments(id) on delete set null,
  consultation_id uuid references public.consultations(id) on delete set null,

  -- Per-clinic human-readable number, e.g. 'SSC/2026/0142'.
  invoice_number  text not null,
  subtotal_paise  integer not null default 0 check (subtotal_paise >= 0),
  discount_paise  integer not null default 0 check (discount_paise >= 0),
  tax_paise       integer not null default 0 check (tax_paise      >= 0),
  total_paise     integer not null default 0 check (total_paise    >= 0),

  status          public.invoice_status not null default 'draft',
  payment_mode    public.payment_mode,
  issued_at       timestamptz,
  paid_at         timestamptz,
  receipt_sent_message_id uuid references public.messages(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check (status <> 'paid' or (paid_at is not null and payment_mode is not null)),
  check (discount_paise <= subtotal_paise),
  unique (clinic_id, invoice_number),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete restrict
);

create index patient_invoices_patient_idx on public.patient_invoices (patient_id, created_at desc);
create index patient_invoices_unpaid_idx
  on public.patient_invoices (clinic_id, issued_at) where status in ('issued','partially_paid');

create trigger patient_invoices_touch before update on public.patient_invoices
  for each row execute function sahva.touch_updated_at();

create table public.patient_invoice_items (
  id               uuid primary key default extensions.gen_random_uuid(),
  invoice_id       uuid not null references public.patient_invoices(id) on delete cascade,
  service_id       uuid references public.clinic_services(id) on delete set null,
  description      text not null,
  quantity         smallint not null default 1 check (quantity > 0),
  unit_price_paise integer not null check (unit_price_paise >= 0),
  amount_paise     integer not null generated always as (quantity * unit_price_paise) stored,
  sort_order       smallint not null default 0
);

create index patient_invoice_items_invoice_idx on public.patient_invoice_items (invoice_id, sort_order);
