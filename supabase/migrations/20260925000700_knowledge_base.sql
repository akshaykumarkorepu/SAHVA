-- ============================================================================
-- SAHVA · 0700 · Clinic knowledge base and service catalogue
-- Everything the AI is allowed to say that is not a schedule fact.
-- Strictly clinic-scoped: RLS plus clinic_id on every read prevents one
-- clinic's fees ever being quoted on another clinic's call.
-- ============================================================================

create table public.clinic_services (
  id            uuid primary key default extensions.gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,

  name_en       text not null,
  name_te       text,
  description   text,
  price_paise   integer check (price_paise >= 0),
  duration_min  smallint check (duration_min between 5 and 240),
  category      text,
  is_active     boolean not null default true,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (id, clinic_id)
);

create unique index clinic_services_name_idx on public.clinic_services (clinic_id, lower(name_en));

create index clinic_services_clinic_idx
  on public.clinic_services (clinic_id, sort_order) where is_active;

create trigger clinic_services_touch before update on public.clinic_services
  for each row execute function sahva.touch_updated_at();

-- ---------------------------------------------------------------------------
-- clinic_faqs — bilingual, retrieval-ready.
-- ---------------------------------------------------------------------------
create table public.clinic_faqs (
  id           uuid primary key default extensions.gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,

  question_en  text not null,
  question_te  text,
  answer_en    text not null,
  answer_te    text,

  category     public.faq_category not null default 'other',
  -- Lexical fallback for Telugu, where embeddings are still weak. Matched
  -- with the && array-overlap operator against tokens from the transcript.
  keywords     text[] not null default '{}',
  priority     smallint not null default 0,
  is_active    boolean not null default true,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index clinic_faqs_clinic_idx    on public.clinic_faqs (clinic_id, category, priority desc) where is_active;
create index clinic_faqs_keywords_idx  on public.clinic_faqs using gin (keywords);
create index clinic_faqs_fts_idx
  on public.clinic_faqs using gin (
    to_tsvector('simple', coalesce(question_en,'') || ' ' || coalesce(question_te,''))
  );

create trigger clinic_faqs_touch before update on public.clinic_faqs
  for each row execute function sahva.touch_updated_at();

comment on table public.clinic_faqs is
  'The AI answers non-schedule questions ONLY from this table, scoped to the calling clinic. Anything not found '
  'here is escalated rather than improvised — no cross-clinic bleed, no invented fees.';
comment on column public.clinic_faqs.keywords is
  'Telugu retrieval falls back to keyword overlap because embedding quality for Telugu is not yet reliable.';
