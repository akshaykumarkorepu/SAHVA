\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

-- A doctor signs up on the website.
do $s$
declare v_new uuid;
begin
  insert into auth.users (email, raw_user_meta_data)
  values ('dr.padma@example.in', '{"full_name":"Dr Padma","account_type":"staff"}'::jsonb)
  returning id into v_new;
  perform set_config('sahva_test.padma', v_new::text, false);
  perform pg_temp.check('pricing is ₹1,999 a month and ₹9,999 a year',
    (select monthly_price_paise = 199900 and yearly_price_paise = 999900 from public.plans where code = 'starter'));
  perform pg_temp.check('only one plan is offered', (select count(*) = 1 from public.plans where is_active));
end $s$;

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('sahva_test.padma'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_clinic uuid; v_sub public.subscriptions; v_blocked boolean := false; v_n int;
begin
  v_clinic := public.create_clinic_with_trial('Padma Children''s Clinic', 'Karimnagar', '+918712000111');
  perform set_config('sahva_test.padma_clinic', v_clinic::text, false);

  select * into v_sub from public.subscriptions where clinic_id = v_clinic;
  perform pg_temp.check('a new clinic starts on a trial', v_sub.status = 'trialing');
  perform pg_temp.check('the trial is 14 days',
    v_sub.trial_ends_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 minute');

  select count(*) into v_n from public.clinic_members
   where clinic_id = v_clinic and staff_id = auth.uid() and role = 'owner' and status = 'active';
  perform pg_temp.check('the person who signed up owns the clinic', v_n = 1);

  select count(*) into v_n from public.clinics;
  perform pg_temp.check('the new owner sees only their own clinic', v_n = 1);

  begin
    perform public.create_clinic_with_trial('Second Try', 'Karimnagar', '+918712000112');
  exception when unique_violation then v_blocked := true;
  end;
  perform pg_temp.check('one account cannot start a second free trial', v_blocked);

  v_blocked := false;
  begin
    perform public.activate_paid_subscription('order_x', 'pay_x');
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a clinic cannot mark its own payment paid', v_blocked);

  v_blocked := false;
  begin
    insert into public.subscription_payments (clinic_id, subscription_id, billing_cycle, amount_paise, razorpay_order_id)
    values (v_clinic, v_sub.id, 'yearly', 100, 'order_forged');
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a clinic cannot write payment records', v_blocked);
end $t$;
commit;

-- A patient account cannot create a clinic.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select auth_user_id from public.patients where full_name='Lakshmi Devi'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_blocked boolean := false;
begin
  begin
    perform public.create_clinic_with_trial('Not A Clinic', 'Warangal', '+918712000113');
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a patient account cannot create a clinic', v_blocked);
end $t$;
rollback;

-- The API, after verifying Razorpay's signature, activates the plan.
do $t$
declare v_sub public.subscriptions; v_pay public.subscription_payments; v_end timestamptz; v_again public.subscription_payments;
begin
  select * into v_sub from public.subscriptions where clinic_id = current_setting('sahva_test.padma_clinic')::uuid;
  insert into public.subscription_payments (clinic_id, subscription_id, billing_cycle, amount_paise, razorpay_order_id)
  values (v_sub.clinic_id, v_sub.id, 'monthly', 199900, 'order_test_1');

  v_pay := public.activate_paid_subscription('order_test_1', 'pay_test_1');
  perform pg_temp.check('a verified payment is marked paid', v_pay.status = 'paid');
  perform pg_temp.check('paying during the trial keeps the remaining trial days',
    v_pay.period_start = v_sub.current_period_end and v_pay.period_end = v_sub.current_period_end + interval '1 month');

  select * into v_sub from public.subscriptions where id = v_sub.id;
  perform pg_temp.check('the subscription becomes active, monthly', v_sub.status = 'active' and v_sub.billing_cycle = 'monthly');
  v_end := v_sub.current_period_end;

  -- The browser and the webhook both report the same payment.
  v_again := public.activate_paid_subscription('order_test_1', 'pay_test_1');
  select * into v_sub from public.subscriptions where id = v_sub.id;
  perform pg_temp.check('reporting the same payment twice extends nothing', v_sub.current_period_end = v_end);

  insert into public.subscription_payments (clinic_id, subscription_id, billing_cycle, amount_paise, razorpay_order_id)
  values (v_sub.clinic_id, v_sub.id, 'yearly', 999900, 'order_test_2');
  v_pay := public.activate_paid_subscription('order_test_2', 'pay_test_2');
  perform pg_temp.check('a yearly payment adds a year after the paid month', v_pay.period_end = v_end + interval '1 year');
end $t$;

-- Ravi (another clinic's owner) sees none of it.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='ravi@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_n int;
begin
  select count(*) into v_n from public.subscription_payments;
  perform pg_temp.check('another clinic''s payments are invisible', v_n = 0);
end $t$;
rollback;
