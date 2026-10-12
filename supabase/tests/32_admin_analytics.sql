\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

do $t$
declare
  r record; v_n int; v_clinic uuid; v_sub uuid;
begin
  select count(*) into v_n from public.admin_monthly_metrics(6);
  perform pg_temp.check('six months, one row each', v_n = 6);

  select * into r from public.admin_monthly_metrics(1);
  perform pg_temp.check('this month counts the clinics created in it',
    r.new_clinics = (select count(*) from public.clinics where created_at >= date_trunc('month', now())));
  perform pg_temp.check('cash collected this month matches the ledger',
    r.collected_paise = (select coalesce(sum(coalesce(captured_paise, amount_paise)), 0) from public.subscription_payments
                           where status = 'paid' and paid_at >= date_trunc('month', now())));

  -- MRR from the ledger: a fresh yearly payment covering now adds a twelfth.
  insert into public.clinics (slug, name, phone_e164, city, verification_status)
  values ('mrr-test', 'MRR Test', '+918799900001', 'Warangal', 'approved') returning id into v_clinic;
  insert into public.subscriptions (clinic_id, plan_code, status, current_period_start, current_period_end)
  values (v_clinic, 'starter', 'active', now() - interval '1 day', now() + interval '1 year') returning id into v_sub;
  select mrr_paise into v_n from public.admin_monthly_metrics(1);
  insert into public.subscription_payments (clinic_id, subscription_id, billing_cycle, amount_paise, captured_paise,
                                            razorpay_order_id, razorpay_payment_id, status, period_start, period_end, paid_at)
  values (v_clinic, v_sub, 'yearly', 999900, 999900, 'order_mrr', 'pay_mrr', 'paid', now() - interval '1 day', now() + interval '1 year', now());
  select * into r from public.admin_monthly_metrics(1);
  perform pg_temp.check('a yearly plan adds a twelfth of its price to MRR', r.mrr_paise - v_n = round(999900 / 12.0));

  update public.subscription_payments set refunded_paise = 999900 where razorpay_order_id = 'order_mrr';
  select * into r from public.admin_monthly_metrics(1);
  perform pg_temp.check('a fully refunded plan adds nothing', r.mrr_paise = v_n);

  select count(*) into v_n from public.admin_clinic_signals();
  perform pg_temp.check('signals for every clinic', v_n = (select count(*) from public.clinics));
  select count(*) into v_n from public.admin_clinic_signals() s where s.id = v_clinic and s.ever_paid;
  perform pg_temp.check('a clinic that paid is marked as having paid', v_n = 1);
end $t$;

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='ravi@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_blocked boolean := false;
begin
  begin perform public.admin_monthly_metrics(3); exception when insufficient_privilege then v_blocked := true; end;
  perform pg_temp.check('clinics cannot read platform metrics', v_blocked);
  v_blocked := false;
  begin perform public.admin_clinic_signals(); exception when insufficient_privilege then v_blocked := true; end;
  perform pg_temp.check('clinics cannot read other clinics'' signals', v_blocked);
end $t$;
rollback;
