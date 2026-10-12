-- ============================================================================
-- SAHVA · Clinic self-signup with a 14-day trial, and paid plans via Razorpay
--
-- Pricing: one plan for clinics, ₹1,999 a month or ₹9,999 a year, after a
-- 14-day free trial that needs no card.
--
-- Payment is prepaid per period through Razorpay Orders: the clinic pays, the
-- API verifies Razorpay's signature, and only then does activate_paid_
-- subscription() extend the subscription. Nothing here trusts the browser's
-- word that a payment happened.
-- ============================================================================

-- --- Pricing ----------------------------------------------------------------
alter table public.plans add column yearly_price_paise integer check (yearly_price_paise >= 0);

insert into public.plans (code, name, monthly_price_paise, yearly_price_paise, included_call_minutes,
                          overage_per_min_paise, max_doctors, sort_order, features, is_active)
values ('starter', 'SAHVA for Clinics', 199900, 999900, 0, 0, null, 1,
        '{"ai_receptionist":true,"whatsapp_confirmations":true,"dashboard":true,"analytics":true}'::jsonb, true)
on conflict (code) do update
   set name = excluded.name,
       monthly_price_paise = excluded.monthly_price_paise,
       yearly_price_paise = excluded.yearly_price_paise,
       features = excluded.features,
       is_active = true;

-- One plan is sold. The others stay as rows (existing subscriptions point at
-- them) but are no longer offered.
update public.plans set is_active = false where code <> 'starter';

alter table public.subscriptions
  add column billing_cycle text check (billing_cycle in ('monthly', 'yearly'));

-- --- Payments ---------------------------------------------------------------
create table public.subscription_payments (
  id                  uuid primary key default extensions.gen_random_uuid(),
  clinic_id           uuid not null references public.clinics(id) on delete cascade,
  subscription_id     uuid not null references public.subscriptions(id) on delete cascade,
  billing_cycle       text not null check (billing_cycle in ('monthly', 'yearly')),
  amount_paise        integer not null check (amount_paise > 0),
  razorpay_order_id   text not null unique,
  razorpay_payment_id text unique,
  status              text not null default 'created' check (status in ('created', 'paid', 'failed')),
  period_start        timestamptz,
  period_end          timestamptz,
  created_by          uuid references public.staff_profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  check (status <> 'paid' or (razorpay_payment_id is not null and paid_at is not null and period_end > period_start))
);

create index subscription_payments_clinic_idx on public.subscription_payments (clinic_id, created_at desc);

alter table public.subscription_payments enable row level security;
create policy subscription_payments_select on public.subscription_payments
  for select to authenticated
  using (sahva.has_role(clinic_id, array['owner', 'manager']::public.staff_role[]));
-- Written only by the API's service role, after it has verified Razorpay.
revoke insert, update, delete on public.subscription_payments from authenticated, anon;

-- --- Self-signup --------------------------------------------------------------
/**
 * A signed-in staff account creates its clinic and becomes its owner, on a
 * 14-day trial. One clinic per account: a person who already belongs to a
 * clinic is refused, so a free trial cannot be farmed from one login.
 */
create or replace function public.create_clinic_with_trial(
  p_name  text,
  p_city  text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_clinic uuid;
  v_slug   text;
begin
  if v_uid is null or not exists (select 1 from public.staff_profiles where id = v_uid) then
    raise exception 'Sign in with a clinic staff account first' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.clinic_members where staff_id = v_uid) then
    raise exception 'This account already belongs to a clinic' using errcode = 'unique_violation';
  end if;

  v_slug := left(regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'), 40)
            || '-' || substr(md5(extensions.gen_random_uuid()::text), 1, 6);

  insert into public.clinics (slug, name, city, phone_e164)
  values (v_slug, btrim(p_name), btrim(p_city), p_phone)
  returning id into v_clinic;

  insert into public.clinic_settings (clinic_id) values (v_clinic);

  insert into public.clinic_members (clinic_id, staff_id, role, status, joined_at)
  values (v_clinic, v_uid, 'owner', 'active', now());

  insert into public.subscriptions (clinic_id, plan_code, status, trial_ends_at,
                                    current_period_start, current_period_end, billing_email)
  values (v_clinic, 'starter', 'trialing', now() + interval '14 days',
          now(), now() + interval '14 days',
          (select email from auth.users where id = v_uid));

  return v_clinic;
end;
$$;

revoke all on function public.create_clinic_with_trial(text, text, text) from public, anon;
grant execute on function public.create_clinic_with_trial(text, text, text) to authenticated;

-- --- Activation ------------------------------------------------------------------
/**
 * Mark a verified Razorpay payment paid and extend the subscription.
 *
 * Called by the API only after checking Razorpay's signature, and by the
 * webhook — so it must be idempotent: the second call for the same payment
 * changes nothing. A paid period starts when the current one ends (a clinic
 * paying on day 3 of its trial keeps the other 11 days), or now if it has
 * already lapsed.
 */
create or replace function public.activate_paid_subscription(p_order_id text, p_payment_id text)
returns public.subscription_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay   public.subscription_payments;
  v_sub   public.subscriptions;
  v_start timestamptz;
  v_end   timestamptz;
begin
  select * into v_pay from public.subscription_payments where razorpay_order_id = p_order_id for update;
  if v_pay.id is null then
    raise exception 'Unknown order %', p_order_id using errcode = 'no_data_found';
  end if;
  if v_pay.status = 'paid' then
    return v_pay;  -- already done: the browser and the webhook both report it
  end if;

  select * into v_sub from public.subscriptions where id = v_pay.subscription_id for update;
  v_start := greatest(now(), v_sub.current_period_end);
  v_end := v_start + case v_pay.billing_cycle when 'yearly' then interval '1 year' else interval '1 month' end;

  update public.subscription_payments
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(),
         period_start = v_start, period_end = v_end
   where id = v_pay.id
  returning * into v_pay;

  update public.subscriptions
     set status = 'active', billing_cycle = v_pay.billing_cycle,
         current_period_end = v_end
   where id = v_sub.id;

  return v_pay;
end;
$$;

revoke all on function public.activate_paid_subscription(text, text) from public, anon, authenticated;
grant execute on function public.activate_paid_subscription(text, text) to service_role;
