-- ============================================================================
-- SAHVA · 1000 · Plans, subscriptions, and per-call unit economics
-- The roadmap says pricing is only finalised once real cost-per-call is known.
-- That requires measuring it, so usage is metered from the first pilot call.
-- ============================================================================

create table public.plans (
  code                    public.plan_code primary key,
  name                    text not null,
  monthly_price_paise     integer not null check (monthly_price_paise >= 0),
  included_call_minutes   integer not null default 0 check (included_call_minutes >= 0),
  overage_per_min_paise   integer not null default 0 check (overage_per_min_paise >= 0),
  max_doctors             smallint check (max_doctors > 0),
  features                jsonb not null default '{}'::jsonb,
  is_active               boolean not null default true,
  sort_order              smallint not null default 0
);

create table public.subscriptions (
  id                    uuid primary key default extensions.gen_random_uuid(),
  clinic_id             uuid not null references public.clinics(id) on delete cascade,
  plan_code             public.plan_code not null references public.plans(code),

  status                public.subscription_status not null default 'trialing',
  started_at            timestamptz not null default now(),
  trial_ends_at         timestamptz,
  current_period_start  timestamptz not null default now(),
  current_period_end    timestamptz not null,
  cancel_at             timestamptz,
  cancelled_at          timestamptz,
  billing_email         extensions.citext,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  check (current_period_end > current_period_start)
);

-- A clinic has at most one live subscription at a time.
create unique index subscriptions_active_idx
  on public.subscriptions (clinic_id)
  where status in ('trialing','active','past_due');

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function sahva.touch_updated_at();

-- ---------------------------------------------------------------------------
-- usage_events — one row per metered vendor unit.
-- Costs are micro-INR integers (1 INR = 1,000,000). LLM token pricing is far
-- below one paise per unit, so paise would round every row to zero and floats
-- would drift over millions of rows.
-- ---------------------------------------------------------------------------
create table public.usage_events (
  id                  uuid primary key default extensions.gen_random_uuid(),
  clinic_id           uuid not null references public.clinics(id) on delete cascade,
  call_id             uuid references public.calls(id)    on delete set null,
  message_id          uuid references public.messages(id) on delete set null,

  kind                public.usage_kind not null,
  provider            text not null,                         -- 'sarvam','deepgram','anthropic','exotel'
  quantity            numeric(14,4) not null check (quantity >= 0),
  unit_cost_micro_inr bigint not null check (unit_cost_micro_inr >= 0),
  cost_micro_inr      bigint not null generated always as
                        ((quantity * unit_cost_micro_inr)::bigint) stored,

  occurred_at         timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index usage_events_clinic_time_idx on public.usage_events (clinic_id, occurred_at desc);
create index usage_events_call_idx        on public.usage_events (call_id) where call_id is not null;
create index usage_events_kind_idx        on public.usage_events (clinic_id, kind, occurred_at desc);

comment on table public.usage_events is
  'Ground truth for unit economics. Roadmap weeks 8-10 ("model real cost-per-call, then price") reads from here.';
comment on column public.usage_events.cost_micro_inr is
  'Generated, so a row can never carry a cost that disagrees with its own quantity x unit price.';

-- ---------------------------------------------------------------------------
-- subscription_invoices — what Sahva bills the clinic.
-- (Distinct from patient_invoices in 1100, which is what the clinic bills the
-- patient. Two different debtors, two different tables.)
-- ---------------------------------------------------------------------------
create table public.subscription_invoices (
  id                 uuid primary key default extensions.gen_random_uuid(),
  clinic_id          uuid not null references public.clinics(id) on delete cascade,
  subscription_id    uuid not null references public.subscriptions(id) on delete cascade,

  period_start       timestamptz not null,
  period_end         timestamptz not null,
  base_paise         integer not null check (base_paise >= 0),
  overage_minutes    integer not null default 0 check (overage_minutes >= 0),
  overage_paise      integer not null default 0 check (overage_paise >= 0),
  tax_paise          integer not null default 0 check (tax_paise >= 0),
  total_paise        integer not null check (total_paise >= 0),

  status             public.invoice_status not null default 'draft',
  issued_at          timestamptz,
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  check (period_end > period_start),
  unique (subscription_id, period_start)
);

create index subscription_invoices_clinic_idx
  on public.subscription_invoices (clinic_id, period_start desc);

create trigger subscription_invoices_touch before update on public.subscription_invoices
  for each row execute function sahva.touch_updated_at();
