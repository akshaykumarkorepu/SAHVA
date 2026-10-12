\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

-- Two-person refunds ---------------------------------------------------------------------------
do $t$
declare
  v_k    uuid := (select id from public.clinics where slug = 'krishna-karimnagar');
  v_a    uuid := (select user_id from public.platform_admins where full_name = 'Payments');
  v_b    uuid;
  v_sub  uuid;
  v_pay  public.subscription_payments;
  v_req  public.refund_requests;
  v_ref  public.refunds;
  v_n    int;
  v_blocked boolean;
begin
  insert into auth.users (email, raw_user_meta_data) values ('second@sahva.example', '{"account_type":"admin"}'::jsonb);
  v_b := sahva.grant_platform_admin('second@sahva.example', 'finance', 'Second');
  select id into v_sub from public.subscriptions where clinic_id = v_k;
  insert into public.subscription_payments (clinic_id, subscription_id, billing_cycle, amount_paise, razorpay_order_id)
  values (v_k, v_sub, 'yearly', 999900, 'order_year');
  v_pay := public.activate_paid_subscription('order_year', 'pay_year', 999900);

  v_blocked := false;
  begin
    perform public.admin_record_refund(v_pay.id, 'rfnd_solo', 999900, 'processing', false, 'Clinic closed', v_a);
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('one admin alone cannot refund a yearly payment', v_blocked);

  v_req := public.admin_request_refund(v_pay.id, 999900, true, 'Clinic closed down', v_a, 'req-rr-1');
  perform pg_temp.check('a large refund becomes a request', v_req.status = 'pending');
  select count(*) into v_n from public.notifications where dedupe_key = 'admin.refund_approval:' || v_req.id and to_email = 'second@sahva.example';
  perform pg_temp.check('the other finance admins are asked to approve', v_n = 1);
  select count(*) into v_n from public.notifications where dedupe_key = 'admin.refund_approval:' || v_req.id and to_email = 'payments@sahva.example';
  perform pg_temp.check('the requester is not asked', v_n = 0);

  v_blocked := false;
  begin
    perform public.admin_decide_refund_request(v_req.id, 'claim', null, v_a);
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('nobody approves their own refund', v_blocked);

  v_blocked := false;
  begin
    perform public.admin_decide_refund_request(v_req.id, 'decline', ' ', v_b);
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('declining needs a reason', v_blocked);

  v_req := public.admin_decide_refund_request(v_req.id, 'claim', null, v_b);
  perform pg_temp.check('a second admin claims it', v_req.status = 'approving' and v_req.decided_by = v_b);
  v_blocked := false;
  begin
    perform public.admin_decide_refund_request(v_req.id, 'claim', null, v_b);
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('it cannot be claimed twice (no double refund)', v_blocked);

  v_ref := public.admin_record_refund(v_pay.id, 'rfnd_year', 999900, 'processed', true, 'Clinic closed down', v_b, 'req-rr-2', v_req.id);
  select * into v_req from public.refund_requests where id = v_req.id;
  perform pg_temp.check('the refund records who asked and who approved',
    v_ref.requested_by = v_a and v_ref.approved_by = v_b and v_req.status = 'approved' and v_req.refund_id = v_ref.id);
  select count(*) into v_n from public.admin_audit_log where action = 'payment.refund_approved' and request_id = 'req-rr-2';
  perform pg_temp.check('the approval is audited', v_n = 1);

  -- Small refunds still need only one admin.
  insert into public.subscription_payments (clinic_id, subscription_id, billing_cycle, amount_paise, razorpay_order_id)
  values (v_k, v_sub, 'monthly', 199900, 'order_month_k');
  v_pay := public.activate_paid_subscription('order_month_k', 'pay_month_k', 199900);
  v_ref := public.admin_record_refund(v_pay.id, 'rfnd_month_k', 199900, 'processing', false, 'Paid by mistake', v_a);
  perform pg_temp.check('a monthly refund needs one admin', v_ref.id is not null and v_ref.approved_by is null);

  v_blocked := false;
  begin
    perform public.admin_record_refund(v_pay.id, 'rfnd_x', 1, 'processing', false, 'x', (select user_id from public.platform_admins where full_name = 'Verifier'));
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('reviewers cannot refund', v_blocked);
end $t$;

-- Break-glass: only the owner opens it ------------------------------------------------------------
do $s$
declare v_sup uuid;
begin
  insert into auth.users (email, raw_user_meta_data) values ('help@sahva.example', '{"account_type":"admin"}'::jsonb);
  v_sup := sahva.grant_platform_admin('help@sahva.example', 'support', 'Helper');
  perform set_config('sahva_test.support', v_sup::text, false);
  perform set_config('sahva_test.srisai', (select id::text from public.clinics where slug = 'sri-sai-warangal'), false);
  perform set_config('sahva_test.lakshmi', (select id::text from public.patients where full_name = 'Lakshmi Devi'), false);
end $s$;

do $t$
declare v_blocked boolean := false;
begin
  begin
    perform public.admin_log_support_access(current_setting('sahva_test.support')::uuid, current_setting('sahva_test.srisai')::uuid,
      current_setting('sahva_test.lakshmi')::uuid, null);
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('support sees no patient until the clinic opens access', v_blocked);
end $t$;

begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'geeta@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$ declare v_blocked boolean := false; begin
  begin
    perform public.grant_support_access(current_setting('sahva_test.srisai')::uuid, 4, 'Booking stuck');
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a receptionist cannot open access', v_blocked);
end $t$;
commit;

begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'ravi@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$ declare v_g public.support_access_grants; v_blocked boolean := false; begin
  begin
    perform public.grant_support_access(current_setting('sahva_test.srisai')::uuid, 100, 'Too long');
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('access opens for at most 72 hours', v_blocked);
  v_g := public.grant_support_access(current_setting('sahva_test.srisai')::uuid, 4, 'Lakshmi''s booking shows twice');
  perform set_config('sahva_test.grant', v_g.id::text, false);
  perform pg_temp.check('the owner opens access for 4 hours', v_g.expires_at between now() + interval '239 minutes' and now() + interval '241 minutes');
end $t$;
commit;

do $t$
declare v_n int; v_blocked boolean := false;
begin
  perform public.admin_log_support_access(current_setting('sahva_test.support')::uuid, current_setting('sahva_test.srisai')::uuid,
    current_setting('sahva_test.lakshmi')::uuid, null, 'req-support-1');
  select count(*) into v_n from public.record_access_log
   where patient_id = current_setting('sahva_test.lakshmi')::uuid and actor_type = 'support' and request_id = 'req-support-1';
  perform pg_temp.check('the look is in the clinic''s own access log', v_n = 1);
  select count(*) into v_n from public.admin_audit_log where action = 'support.view_patient' and request_id = 'req-support-1'
     and reason = 'Lakshmi''s booking shows twice';
  perform pg_temp.check('and in the admin audit log, with the clinic''s reason', v_n = 1);
  begin
    perform public.admin_log_support_access((select user_id from public.platform_admins where full_name = 'Second'),
      current_setting('sahva_test.srisai')::uuid, current_setting('sahva_test.lakshmi')::uuid, null);
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('finance admins cannot use support access', v_blocked);
end $t$;

begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'ravi@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$ begin
  perform public.revoke_support_access(current_setting('sahva_test.grant')::uuid);
  perform pg_temp.check('the owner closes it', true);
end $t$;
commit;

do $t$ declare v_blocked boolean := false; begin
  begin
    perform public.admin_log_support_access(current_setting('sahva_test.support')::uuid, current_setting('sahva_test.srisai')::uuid, null, 'lak');
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('closed means closed', v_blocked);
end $t$;
