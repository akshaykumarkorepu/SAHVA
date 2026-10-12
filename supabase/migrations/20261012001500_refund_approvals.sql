-- ============================================================================
-- SAHVA · Two-person refunds
--
-- A refund above platform_settings.refund_second_approval_paise (₹2,000 by
-- default — so any yearly refund) needs two finance admins: one asks, a
-- different one approves. The database enforces it: admin_record_refund()
-- refuses a large refund that is not tied to a request approved by someone
-- other than the requester.
--
--   pending → approving (claimed by the approver while Razorpay is called)
--           → approved  (refund recorded)
--   pending → declined | cancelled
--   approving → pending (Razorpay refused; claim released)
-- ============================================================================

create table public.refund_requests (
  id            uuid primary key default extensions.gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  payment_id    uuid not null references public.subscription_payments(id) on delete cascade,
  amount_paise  integer not null check (amount_paise > 0),
  revoke_period boolean not null,
  reason        text not null check (length(btrim(reason)) between 3 and 1000),
  requested_by  uuid not null references public.platform_admins(user_id),
  requested_at  timestamptz not null default now(),
  status        text not null default 'pending' check (status in ('pending', 'approving', 'approved', 'declined', 'cancelled')),
  decided_by    uuid references public.platform_admins(user_id),
  decided_at    timestamptz,
  decision_note text,
  refund_id     uuid unique references public.refunds(id),
  check (decided_by is null or decided_by <> requested_by),
  check (status <> 'approved' or refund_id is not null)
);
create unique index refund_requests_one_open on public.refund_requests (payment_id) where status in ('pending', 'approving');
alter table public.refund_requests enable row level security;
revoke all on public.refund_requests from authenticated, anon;

alter table public.refunds add column approved_by uuid references public.platform_admins(user_id);

create or replace function sahva.require_finance_admin(p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.platform_admins
                  where user_id = p_admin_id and disabled_at is null and role in ('super_admin', 'finance')) then
    raise exception 'Only finance admins handle refunds' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

/** Ask for a large refund. A second finance admin must approve it. Audited. */
create or replace function public.admin_request_refund(
  p_payment_id uuid, p_amount integer, p_revoke_period boolean, p_reason text, p_admin_id uuid, p_request_id text default null
)
returns public.refund_requests
language plpgsql
security definer
set search_path = ''
as $$
declare v_pay public.subscription_payments; v_req public.refund_requests;
begin
  perform sahva.require_finance_admin(p_admin_id);
  select * into v_pay from public.subscription_payments where id = p_payment_id for update;
  if v_pay.status is distinct from 'paid' then
    raise exception 'Only a paid payment can be refunded' using errcode = 'invalid_parameter_value';
  end if;
  if p_amount > coalesce(v_pay.captured_paise, v_pay.amount_paise) - v_pay.refunded_paise then
    raise exception 'That is more than is left to refund' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.refund_requests where payment_id = p_payment_id and status in ('pending', 'approving')) then
    raise exception 'A refund for this payment is already waiting for approval' using errcode = 'unique_violation';
  end if;

  insert into public.refund_requests (clinic_id, payment_id, amount_paise, revoke_period, reason, requested_by)
  values (v_pay.clinic_id, v_pay.id, p_amount, p_revoke_period, btrim(p_reason), p_admin_id)
  returning * into v_req;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, reason, after, request_id)
  values (p_admin_id, 'payment.refund_requested', 'clinic', v_pay.clinic_id::text, btrim(p_reason),
          jsonb_build_object('payment', v_pay.razorpay_payment_id, 'amount_paise', p_amount, 'refund_request', v_req.id),
          p_request_id);

  perform sahva.notify_admins(array['finance']::public.platform_admin_role[], 'admin.refund_approval',
    jsonb_build_object('amount_paise', p_amount, 'reason', btrim(p_reason),
                       'requested_by', (select full_name from public.platform_admins where user_id = p_admin_id)),
    'admin.refund_approval:' || v_req.id, v_pay.clinic_id);
  -- The requester is not asked to approve their own refund.
  delete from public.notifications
   where dedupe_key = 'admin.refund_approval:' || v_req.id
     and to_email = (select email from auth.users where id = p_admin_id);
  return v_req;
end;
$$;

/**
 * Act on a request:
 *   claim   — the approver takes it before calling Razorpay (pending → approving)
 *   release — Razorpay refused; back to pending for another try
 *   decline — not refunded (note required)
 *   cancel  — the requester withdraws it
 */
create or replace function public.admin_decide_refund_request(
  p_request uuid, p_action text, p_note text, p_admin_id uuid, p_request_id text default null
)
returns public.refund_requests
language plpgsql
security definer
set search_path = ''
as $$
declare v_req public.refund_requests;
begin
  perform sahva.require_finance_admin(p_admin_id);
  select * into v_req from public.refund_requests where id = p_request for update;
  if v_req.id is null then
    raise exception 'Unknown refund request' using errcode = 'no_data_found';
  end if;

  if p_action = 'claim' then
    if v_req.status <> 'pending' then
      raise exception 'This refund is % and cannot be approved', v_req.status using errcode = 'invalid_parameter_value';
    end if;
    if v_req.requested_by = p_admin_id then
      raise exception 'A refund you asked for must be approved by someone else' using errcode = 'insufficient_privilege';
    end if;
    update public.refund_requests set status = 'approving', decided_by = p_admin_id, decided_at = now()
     where id = p_request returning * into v_req;
  elsif p_action = 'release' then
    if v_req.status <> 'approving' or v_req.decided_by <> p_admin_id then
      raise exception 'Nothing to release' using errcode = 'invalid_parameter_value';
    end if;
    update public.refund_requests set status = 'pending', decided_by = null, decided_at = null
     where id = p_request returning * into v_req;
  elsif p_action in ('decline', 'cancel') then
    if v_req.status <> 'pending' then
      raise exception 'This refund is % already', v_req.status using errcode = 'invalid_parameter_value';
    end if;
    if p_action = 'decline' and (v_req.requested_by = p_admin_id or coalesce(btrim(p_note), '') = '') then
      raise exception 'Declining needs a different admin and a reason' using errcode = 'invalid_parameter_value';
    end if;
    if p_action = 'cancel' and v_req.requested_by <> p_admin_id then
      raise exception 'Only the admin who asked can withdraw it' using errcode = 'insufficient_privilege';
    end if;
    update public.refund_requests
       set status = case p_action when 'decline' then 'declined' else 'cancelled' end,
           decided_by = case p_action when 'decline' then p_admin_id end,
           decided_at = now(), decision_note = nullif(btrim(p_note), '')
     where id = p_request returning * into v_req;
    insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, reason, after, request_id)
    values (p_admin_id, 'payment.refund_' || case p_action when 'decline' then 'declined' else 'cancelled' end,
            'clinic', v_req.clinic_id::text, nullif(btrim(p_note), ''),
            jsonb_build_object('refund_request', v_req.id, 'amount_paise', v_req.amount_paise), p_request_id);
  else
    raise exception 'Unknown action %', p_action using errcode = 'invalid_parameter_value';
  end if;
  return v_req;
end;
$$;

-- --- admin_record_refund, now threshold-aware ---------------------------------------------
drop function public.admin_record_refund(uuid, text, integer, text, boolean, text, uuid, text);

/**
 * Record a refund Razorpay has accepted. Above the threshold it must come
 * from a request this admin claimed and someone else made; the request is
 * closed with it. Optionally takes back the unused part of the period.
 */
create or replace function public.admin_record_refund(
  p_payment_id uuid, p_razorpay_refund_id text, p_amount integer, p_status text,
  p_revoke_period boolean, p_reason text, p_admin_id uuid, p_request_id text default null,
  p_refund_request uuid default null
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
  v_req    public.refund_requests;
  v_cut    interval;
  v_limit  int := (select refund_second_approval_paise from public.platform_settings);
begin
  perform sahva.require_finance_admin(p_admin_id);
  select * into v_pay from public.subscription_payments where id = p_payment_id for update;
  if v_pay.status is distinct from 'paid' then
    raise exception 'Only a paid payment can be refunded' using errcode = 'invalid_parameter_value';
  end if;
  if p_amount > coalesce(v_pay.captured_paise, v_pay.amount_paise) - v_pay.refunded_paise then
    raise exception 'That is more than is left to refund' using errcode = 'invalid_parameter_value';
  end if;

  if p_refund_request is not null then
    select * into v_req from public.refund_requests where id = p_refund_request for update;
    if v_req.status is distinct from 'approving' or v_req.decided_by <> p_admin_id or v_req.payment_id <> p_payment_id
       or v_req.amount_paise <> p_amount then
      raise exception 'That refund request has not been approved by you' using errcode = 'insufficient_privilege';
    end if;
  elsif p_amount > v_limit then
    raise exception 'Refunds above % paise need a second admin''s approval', v_limit using errcode = 'insufficient_privilege';
  end if;

  insert into public.refunds (clinic_id, payment_id, razorpay_refund_id, amount_paise, reason, revoked_period, status,
                              requested_by, approved_by, processed_at)
  values (v_pay.clinic_id, v_pay.id, p_razorpay_refund_id, p_amount, btrim(p_reason), p_revoke_period, p_status,
          coalesce(v_req.requested_by, p_admin_id), case when v_req.id is not null then p_admin_id end,
          case when p_status = 'processed' then now() end)
  returning * into v_refund;

  update public.subscription_payments set refunded_paise = refunded_paise + p_amount where id = v_pay.id;

  if p_revoke_period then
    v_cut := greatest(v_pay.period_end - greatest(v_pay.period_start, now()), interval '0');
    select * into v_sub from public.subscriptions where id = v_pay.subscription_id for update;
    update public.subscriptions
       set current_period_end = greatest(current_period_end - v_cut, current_period_start + interval '1 second')
     where id = v_sub.id;
  end if;

  if v_req.id is not null then
    update public.refund_requests set status = 'approved', refund_id = v_refund.id, decided_at = now() where id = v_req.id;
  end if;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, reason, before, after, request_id)
  values (p_admin_id, case when v_req.id is not null then 'payment.refund_approved' else 'payment.refund' end,
          'clinic', v_pay.clinic_id::text, btrim(p_reason),
          jsonb_build_object('payment', v_pay.razorpay_payment_id, 'refunded_paise', v_pay.refunded_paise),
          jsonb_build_object('refund', p_razorpay_refund_id, 'amount_paise', p_amount, 'revoked_period', p_revoke_period,
                             'refund_request', v_req.id, 'requested_by', v_req.requested_by),
          p_request_id);
  return v_refund;
end;
$$;

revoke all on function sahva.require_finance_admin(uuid) from public, anon, authenticated;
revoke all on function public.admin_request_refund(uuid, integer, boolean, text, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_decide_refund_request(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_record_refund(uuid, text, integer, text, boolean, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_request_refund(uuid, integer, boolean, text, uuid, text) to service_role;
grant execute on function public.admin_decide_refund_request(uuid, text, text, uuid, text) to service_role;
grant execute on function public.admin_record_refund(uuid, text, integer, text, boolean, text, uuid, text, uuid) to service_role;
