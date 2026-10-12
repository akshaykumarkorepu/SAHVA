-- ============================================================================
-- SAHVA · Payment operations: the ledger's edge cases, made visible and fixable
--
-- payment_events      every Razorpay webhook, verified or not, once per event
-- payment_exceptions  money that did not go where it should, for an admin
-- refunds             what was given back, through Razorpay, and why
--
-- activate_paid_subscription() now takes the captured amount and refuses to
-- activate on a mismatch (raising an exception row instead), and flags a
-- second payment for the same subscription inside 30 minutes as a likely
-- duplicate. All of it is service-role only; admins act through the API,
-- and every admin action is in admin_audit_log.
-- ============================================================================

-- --- Ledger columns ----------------------------------------------------------------
alter table public.subscription_payments drop constraint subscription_payments_status_check;
alter table public.subscription_payments
  add constraint subscription_payments_status_check check (status in ('created', 'paid', 'failed', 'expired')),
  add column captured_paise integer check (captured_paise >= 0),
  add column refunded_paise integer not null default 0 check (refunded_paise >= 0),
  add constraint subscription_payments_refund_bounded check (refunded_paise <= coalesce(captured_paise, amount_paise));

-- --- Webhook events --------------------------------------------------------------------
create table public.payment_events (
  id                  uuid primary key default extensions.gen_random_uuid(),
  provider_event_id   text unique,          -- x-razorpay-event-id; null when unsigned
  event_type          text,
  signature_ok        boolean not null,
  razorpay_payment_id text,
  razorpay_order_id   text,
  razorpay_refund_id  text,
  amount_paise        integer,
  -- Only verified events keep their body: an unverified one is noise at best.
  payload             jsonb check (signature_ok or payload is null),
  outcome             text,
  received_at         timestamptz not null default now()
);
create index payment_events_time_idx on public.payment_events (received_at desc);
create index payment_events_order_idx on public.payment_events (razorpay_order_id) where razorpay_order_id is not null;
alter table public.payment_events enable row level security;
revoke all on public.payment_events from authenticated, anon;
create trigger payment_events_append_only before update or delete on public.payment_events
  for each row execute function sahva.reject_log_change();

-- --- Exceptions ----------------------------------------------------------------------------
create table public.payment_exceptions (
  id                  uuid primary key default extensions.gen_random_uuid(),
  kind                text not null check (kind in (
                        'paid_not_activated', 'duplicate_payment', 'amount_mismatch',
                        'authorized_not_captured', 'refund_failed', 'dispute', 'signature_failure')),
  status              text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  clinic_id           uuid references public.clinics(id) on delete set null,
  payment_id          uuid references public.subscription_payments(id) on delete set null,
  razorpay_payment_id text,
  razorpay_order_id   text,
  amount_paise        integer,
  details             jsonb not null default '{}'::jsonb,
  detected_at         timestamptz not null default now(),
  resolved_by         uuid references public.platform_admins(user_id),
  resolved_at         timestamptz,
  resolution          text,
  check (status = 'open' or (resolved_at is not null and resolution is not null))
);
-- One open exception of a kind per payment: detection may run many times.
create unique index payment_exceptions_once
  on public.payment_exceptions (kind, coalesce(razorpay_payment_id, razorpay_order_id, id::text))
  where status = 'open';
create index payment_exceptions_open_idx on public.payment_exceptions (detected_at) where status = 'open';
alter table public.payment_exceptions enable row level security;
revoke all on public.payment_exceptions from authenticated, anon;

create or replace function public.record_payment_exception(
  p_kind text, p_payment_id uuid, p_rzp_payment text, p_rzp_order text, p_amount integer, p_details jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_clinic uuid;
begin
  select clinic_id into v_clinic from public.subscription_payments
   where id = p_payment_id or (p_rzp_order is not null and razorpay_order_id = p_rzp_order)
   limit 1;
  insert into public.payment_exceptions (kind, clinic_id, payment_id, razorpay_payment_id, razorpay_order_id, amount_paise, details)
  values (p_kind, v_clinic,
          coalesce(p_payment_id, (select id from public.subscription_payments where razorpay_order_id = p_rzp_order)),
          p_rzp_payment, p_rzp_order, p_amount, coalesce(p_details, '{}'::jsonb))
  on conflict do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_payment_exception(text, uuid, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.record_payment_exception(text, uuid, text, text, integer, jsonb) to service_role;

-- --- Activation, now amount-checked and duplicate-aware ----------------------------------
drop function public.activate_paid_subscription(text, text);

/**
 * Mark a captured Razorpay payment paid and extend the subscription.
 * Idempotent. When the captured amount is not the order's amount it does not
 * activate: it records an amount_mismatch exception and returns the row
 * still 'created', which callers check. A second payment for the same
 * subscription within 30 minutes still activates (the money arrived) but is
 * flagged as a likely duplicate for an admin to refund.
 */
create or replace function public.activate_paid_subscription(
  p_order_id text, p_payment_id text, p_captured_paise integer
)
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
    return v_pay;
  end if;
  if p_captured_paise is distinct from v_pay.amount_paise then
    -- Record it and leave the payment unactivated. Not a raise: that would
    -- roll back the exception row along with everything else.
    perform public.record_payment_exception('amount_mismatch', v_pay.id, p_payment_id, p_order_id, p_captured_paise,
      jsonb_build_object('expected_paise', v_pay.amount_paise, 'captured_paise', p_captured_paise));
    return v_pay;  -- status still 'created': callers treat that as not activated
  end if;

  select * into v_sub from public.subscriptions where id = v_pay.subscription_id for update;
  v_start := greatest(now(), v_sub.current_period_end);
  v_end := v_start + case v_pay.billing_cycle when 'yearly' then interval '1 year' else interval '1 month' end;

  update public.subscription_payments
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(),
         captured_paise = p_captured_paise, period_start = v_start, period_end = v_end
   where id = v_pay.id
  returning * into v_pay;

  update public.subscriptions
     set status = 'active', billing_cycle = v_pay.billing_cycle, current_period_end = v_end
   where id = v_sub.id;

  if exists (
    select 1 from public.subscription_payments o
     where o.subscription_id = v_pay.subscription_id and o.id <> v_pay.id
       and o.status = 'paid' and o.paid_at > now() - interval '30 minutes'
  ) then
    perform public.record_payment_exception('duplicate_payment', v_pay.id, p_payment_id, p_order_id, p_captured_paise,
      jsonb_build_object('note', 'Another payment for this subscription was made in the last 30 minutes'));
  end if;

  return v_pay;
end;
$$;
revoke all on function public.activate_paid_subscription(text, text, integer) from public, anon, authenticated;
grant execute on function public.activate_paid_subscription(text, text, integer) to service_role;

-- --- Refunds ----------------------------------------------------------------------------------
create table public.refunds (
  id                 uuid primary key default extensions.gen_random_uuid(),
  clinic_id          uuid not null references public.clinics(id) on delete cascade,
  payment_id         uuid not null references public.subscription_payments(id) on delete cascade,
  razorpay_refund_id text unique,
  amount_paise       integer not null check (amount_paise > 0),
  reason             text not null check (length(btrim(reason)) between 3 and 1000),
  revoked_period     boolean not null default false,
  status             text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  requested_by       uuid not null references public.platform_admins(user_id),
  created_at         timestamptz not null default now(),
  processed_at       timestamptz
);
create index refunds_payment_idx on public.refunds (payment_id);
alter table public.refunds enable row level security;
revoke all on public.refunds from authenticated, anon;

/**
 * Record a refund Razorpay has accepted. Optionally take back the unused part
 * of the period that payment bought — a refunded month should not keep
 * running. Audited in the same transaction.
 */
create or replace function public.admin_record_refund(
  p_payment_id uuid, p_razorpay_refund_id text, p_amount integer, p_status text,
  p_revoke_period boolean, p_reason text, p_admin_id uuid, p_request_id text default null
)
returns public.refunds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay    public.subscription_payments;
  v_sub    public.subscriptions;
  v_refund public.refunds;
  v_cut    interval;
begin
  if not exists (select 1 from public.platform_admins where user_id = p_admin_id and disabled_at is null) then
    raise exception 'Not an active platform admin' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pay from public.subscription_payments where id = p_payment_id for update;
  if v_pay.status <> 'paid' then
    raise exception 'Only a paid payment can be refunded' using errcode = 'invalid_parameter_value';
  end if;
  if p_amount > coalesce(v_pay.captured_paise, v_pay.amount_paise) - v_pay.refunded_paise then
    raise exception 'That is more than is left to refund' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.refunds (clinic_id, payment_id, razorpay_refund_id, amount_paise, reason, revoked_period, status, requested_by,
                              processed_at)
  values (v_pay.clinic_id, v_pay.id, p_razorpay_refund_id, p_amount, btrim(p_reason), p_revoke_period, p_status, p_admin_id,
          case when p_status = 'processed' then now() end)
  returning * into v_refund;

  update public.subscription_payments set refunded_paise = refunded_paise + p_amount where id = v_pay.id;

  if p_revoke_period then
    -- Remove what is left of this payment's period from the subscription.
    v_cut := greatest(v_pay.period_end - greatest(v_pay.period_start, now()), interval '0');
    select * into v_sub from public.subscriptions where id = v_pay.subscription_id for update;
    update public.subscriptions
       set current_period_end = greatest(current_period_end - v_cut, current_period_start + interval '1 second')
     where id = v_sub.id;
  end if;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, reason, before, after, request_id)
  values (p_admin_id, 'payment.refund', 'clinic', v_pay.clinic_id::text, btrim(p_reason),
          jsonb_build_object('payment', v_pay.razorpay_payment_id, 'refunded_paise', v_pay.refunded_paise),
          jsonb_build_object('refund', p_razorpay_refund_id, 'amount_paise', p_amount, 'revoked_period', p_revoke_period),
          p_request_id);
  return v_refund;
end;
$$;
revoke all on function public.admin_record_refund(uuid, text, integer, text, boolean, text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_record_refund(uuid, text, integer, text, boolean, text, uuid, text) to service_role;

/** Close an exception with what was done about it. Audited. */
create or replace function public.admin_resolve_payment_exception(
  p_exception_id uuid, p_status text, p_resolution text, p_admin_id uuid, p_request_id text default null
)
returns public.payment_exceptions
language plpgsql
security definer
set search_path = ''
as $$
declare v_ex public.payment_exceptions;
begin
  if not exists (select 1 from public.platform_admins where user_id = p_admin_id and disabled_at is null) then
    raise exception 'Not an active platform admin' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('resolved', 'dismissed') or coalesce(btrim(p_resolution), '') = '' then
    raise exception 'Say what was done' using errcode = 'invalid_parameter_value';
  end if;
  update public.payment_exceptions
     set status = p_status, resolution = btrim(p_resolution), resolved_by = p_admin_id, resolved_at = now()
   where id = p_exception_id and status = 'open'
  returning * into v_ex;
  if v_ex.id is null then
    raise exception 'That exception is not open' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, reason, after, request_id)
  values (p_admin_id, 'payment.exception_' || p_status, 'payment_exception', v_ex.id::text, btrim(p_resolution),
          jsonb_build_object('kind', v_ex.kind, 'payment', v_ex.razorpay_payment_id), p_request_id);
  return v_ex;
end;
$$;
revoke all on function public.admin_resolve_payment_exception(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_resolve_payment_exception(uuid, text, text, uuid, text) to service_role;
