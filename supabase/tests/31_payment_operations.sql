\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

do $t$
declare
  v_admin  uuid;
  v_clinic uuid := (select id from public.clinics where name = 'Anand Clinic');
  v_sub    public.subscriptions;
  v_pay    public.subscription_payments;
  v_ref    public.refunds;
  v_ex     public.payment_exceptions;
  v_end    timestamptz;
  v_n      int;
  v_blocked boolean;
begin
  insert into auth.users (email, raw_user_meta_data) values ('payments@sahva.example', '{"account_type":"admin"}'::jsonb);
  v_admin := sahva.grant_platform_admin('payments@sahva.example', 'finance', 'Payments');
  select * into v_sub from public.subscriptions where clinic_id = v_clinic;

  -- Amount mismatch: not activated, and visible ------------------------------------
  insert into public.subscription_payments (clinic_id, subscription_id, billing_cycle, amount_paise, razorpay_order_id)
  values (v_clinic, v_sub.id, 'monthly', 199900, 'order_short');
  v_pay := public.activate_paid_subscription('order_short', 'pay_short', 100);
  perform pg_temp.check('a short payment does not activate anything', v_pay.status = 'created');
  select count(*) into v_n from public.payment_exceptions where kind = 'amount_mismatch' and razorpay_order_id = 'order_short' and status = 'open';
  perform pg_temp.check('the mismatch is waiting for an admin', v_n = 1);
  perform public.activate_paid_subscription('order_short', 'pay_short', 100);
  select count(*) into v_n from public.payment_exceptions where kind = 'amount_mismatch' and razorpay_order_id = 'order_short';
  perform pg_temp.check('reporting it again does not duplicate the exception', v_n = 1);

  -- Paid twice within half an hour ---------------------------------------------------
  insert into public.subscription_payments (clinic_id, subscription_id, billing_cycle, amount_paise, razorpay_order_id)
  values (v_clinic, v_sub.id, 'monthly', 199900, 'order_a'), (v_clinic, v_sub.id, 'monthly', 199900, 'order_b');
  perform public.activate_paid_subscription('order_a', 'pay_a', 199900);
  select current_period_end into v_end from public.subscriptions where id = v_sub.id;
  v_pay := public.activate_paid_subscription('order_b', 'pay_b', 199900);
  perform pg_temp.check('money that arrived is honoured: the second payment still activates', v_pay.status = 'paid');
  select count(*) into v_n from public.payment_exceptions where kind = 'duplicate_payment' and razorpay_payment_id = 'pay_b';
  perform pg_temp.check('the second payment is flagged as a likely duplicate', v_n = 1);

  -- Refund the duplicate and take back its month ------------------------------------
  v_blocked := false;
  begin
    perform public.admin_record_refund(v_pay.id, 'rfnd_too_much', 999999, 'processing', false, 'too much', v_admin);
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('a refund cannot exceed what was paid', v_blocked);

  v_ref := public.admin_record_refund(v_pay.id, 'rfnd_dup', 199900, 'processing', true, 'Paid twice by mistake', v_admin, 'req-refund-1');
  perform pg_temp.check('the refund is recorded', v_ref.amount_paise = 199900 and v_ref.revoked_period);
  select * into v_sub from public.subscriptions where id = v_sub.id;
  perform pg_temp.check('the refunded month is taken back off the subscription', v_sub.current_period_end = v_end);

  v_blocked := false;
  begin
    perform public.admin_record_refund(v_pay.id, 'rfnd_again', 1, 'processing', false, 'again', v_admin);
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('a fully refunded payment cannot be refunded again', v_blocked);

  select count(*) into v_n from public.admin_audit_log where action = 'payment.refund' and request_id = 'req-refund-1' and reason = 'Paid twice by mistake';
  perform pg_temp.check('the refund is in the admin audit log with its reason', v_n = 1);

  -- Resolve exceptions ---------------------------------------------------------------
  select * into v_ex from public.payment_exceptions where kind = 'duplicate_payment' and razorpay_payment_id = 'pay_b';
  v_blocked := false;
  begin
    perform public.admin_resolve_payment_exception(v_ex.id, 'resolved', ' ', v_admin);
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('closing an exception needs a note of what was done', v_blocked);
  v_ex := public.admin_resolve_payment_exception(v_ex.id, 'resolved', 'Refunded rfnd_dup', v_admin);
  perform pg_temp.check('the exception is closed by a named admin', v_ex.status = 'resolved' and v_ex.resolved_by = v_admin);

  -- Webhook events are a record, not a scratchpad -------------------------------------
  insert into public.payment_events (provider_event_id, event_type, signature_ok, payload) values ('evt_1', 'payment.captured', true, '{}'::jsonb);
  v_blocked := false;
  begin
    insert into public.payment_events (provider_event_id, event_type, signature_ok, payload) values ('evt_1', 'payment.captured', true, '{}'::jsonb);
  exception when unique_violation then v_blocked := true;
  end;
  perform pg_temp.check('the same webhook event is stored once', v_blocked);

  v_blocked := false;
  begin
    insert into public.payment_events (event_type, signature_ok, payload) values ('forged', false, '{"x":1}'::jsonb);
  exception when check_violation then v_blocked := true;
  end;
  perform pg_temp.check('an unverified webhook keeps no body', v_blocked);

  v_blocked := false;
  begin
    update public.payment_events set outcome = 'edited';
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('webhook events cannot be edited', v_blocked);
end $t$;

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='ravi@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_blocked boolean;
begin
  v_blocked := false;
  begin perform count(*) from public.payment_exceptions; exception when insufficient_privilege then v_blocked := true; end;
  perform pg_temp.check('clinics cannot see payment exceptions', v_blocked);
  v_blocked := false;
  begin perform count(*) from public.refunds; exception when insufficient_privilege then v_blocked := true; end;
  perform pg_temp.check('clinics cannot see the refunds table', v_blocked);
  v_blocked := false;
  begin perform count(*) from public.payment_events; exception when insufficient_privilege then v_blocked := true; end;
  perform pg_temp.check('clinics cannot see webhook events', v_blocked);
end $t$;
rollback;
