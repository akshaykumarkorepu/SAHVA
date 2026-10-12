\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

-- Events from earlier suites (Anand applied, was approved, paid, was refunded) left emails behind.
do $t$
declare
  v_anand uuid := (select id from public.clinics where name = 'Anand Clinic');
  v_n int;
begin
  select count(*) into v_n from public.notifications
   where clinic_id = v_anand and kind = 'application.received' and to_email = 'dr.anand@example.in';
  perform pg_temp.check('the owner is told each time their application arrives (first, then resubmitted)', v_n = 2);
  select count(*) into v_n from public.notifications
   where clinic_id = v_anand and kind = 'admin.new_application' and to_email = 'verifier@sahva.example';
  perform pg_temp.check('reviewers hear about a new application', v_n = 1);
  select count(*) into v_n from public.notifications where clinic_id = v_anand and kind = 'application.approved';
  perform pg_temp.check('the owner is told the clinic was approved', v_n = 1);
  select count(*) into v_n from public.notifications where clinic_id = v_anand and kind = 'payment.received';
  perform pg_temp.check('each payment received is acknowledged once', v_n >= 2);
  select count(*) into v_n from public.notifications
   where kind = 'admin.payment_exception' and to_email = 'payments@sahva.example';
  perform pg_temp.check('finance hears about payment exceptions', v_n >= 2);
  select count(*) into v_n from public.notifications
   where kind = 'admin.payment_exception' and to_email = 'verifier@sahva.example';
  perform pg_temp.check('reviewers are not sent payment problems', v_n = 0);
  select count(*) into v_n from public.notifications where payload::text ~* 'lakshmi|mohan';
  perform pg_temp.check('no patient appears in any notification', v_n = 0);
end $t$;

-- Invoices wait for the seller's details -----------------------------------------------------
do $t$
declare
  v_anand  uuid := (select id from public.clinics where name = 'Anand Clinic');
  v_boss   uuid;
  v_inv    public.invoices;
  v_cn     public.invoices;
  v_n      int;
  v_blocked boolean := false;
begin
  select count(*) into v_n from public.invoices;
  perform pg_temp.check('no invoice is issued while the seller is a placeholder', v_n = 0);

  begin
    perform public.admin_update_platform_settings('{"legal_name":"X"}'::jsonb,
      (select user_id from public.platform_admins where full_name = 'Payments'));
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('only a super admin changes the business details', v_blocked);

  insert into auth.users (email, raw_user_meta_data) values ('boss@sahva.example', '{"account_type":"admin"}'::jsonb);
  v_boss := sahva.grant_platform_admin('boss@sahva.example', 'super_admin', 'Boss');
  update public.refunds set status = 'processed', processed_at = now() where razorpay_refund_id = 'rfnd_dup';
  perform public.admin_update_platform_settings(
    '{"legal_name":"SAHVA Health Technologies Pvt Ltd","address":"Plot 12, Hanamkonda, Warangal 506001","gstin":"36AAACS1234A1Z1"}'::jsonb,
    v_boss, 'req-settings-1');

  select count(*) into v_n from public.subscription_payments p
   where p.status = 'paid' and not exists (select 1 from public.invoices i where i.payment_id = p.id and i.kind = 'invoice');
  perform pg_temp.check('filling in the details issues every invoice that was owed', v_n = 0);

  select * into v_inv from public.invoices i
    join public.subscription_payments p on p.id = i.payment_id
   where p.razorpay_payment_id = 'pay_b' and i.kind = 'invoice';
  perform pg_temp.check('invoice numbers run per financial year', v_inv.number ~ '^INV/26-27/[0-9]{5}$');
  perform pg_temp.check('the price includes GST: ₹1,999 is ₹1,694.07 + tax', v_inv.taxable_paise = 169407 and v_inv.total_paise = 199900);
  perform pg_temp.check('a Telangana clinic pays CGST and SGST, not IGST',
    v_inv.cgst_paise = 15246 and v_inv.sgst_paise = 15247 and v_inv.igst_paise = 0 and v_inv.is_tax_invoice);
  perform pg_temp.check('the buyer''s GSTIN is on the invoice', v_inv.buyer->>'gstin' = '36ABCDE1234F1Z5');

  select * into v_cn from public.invoices where kind = 'credit_note' and original_invoice_id = v_inv.id;
  perform pg_temp.check('a processed refund gets a credit note against its invoice',
    v_cn.number ~ '^CN/26-27/[0-9]{5}$' and v_cn.total_paise = 199900 and v_cn.cgst_paise + v_cn.sgst_paise = 30493);

  v_blocked := false;
  begin
    update public.invoices set total_paise = 1 where id = v_inv.id;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('an issued invoice cannot be changed', v_blocked);

  perform pg_temp.check('financial years turn in April',
    sahva.financial_year('2027-03-31 12:00+05:30') = '26-27' and sahva.financial_year('2027-04-01 00:30+05:30') = '27-28');
  select count(*) into v_n from public.admin_audit_log where action = 'platform.settings' and request_id = 'req-settings-1';
  perform pg_temp.check('the settings change is audited', v_n = 1);
  perform public.issue_missing_invoices();
  select count(*) into v_n from public.invoices where payment_id = v_inv.payment_id;
  perform pg_temp.check('issuing again never duplicates', v_n = 2);
  perform set_config('sahva_test.anand_invoice', v_inv.id::text, false);
end $t$;

-- Owners see their own invoices, nobody else's
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'dr.anand@example.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$ begin
  perform pg_temp.check('the owner can read their invoice',
    exists (select 1 from public.invoices where id = current_setting('sahva_test.anand_invoice')::uuid));
end $t$;
commit;
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'suresh@krishna.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$ declare v_n int; v_blocked boolean := false; begin
  select count(*) into v_n from public.invoices where id = current_setting('sahva_test.anand_invoice')::uuid;
  perform pg_temp.check('another clinic cannot', v_n = 0);
  begin
    select count(*) into v_n from public.notifications;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('clinics cannot read the email outbox', v_blocked);
end $t$;
commit;

-- Time-based reminders and sending --------------------------------------------------------------
do $t$
declare
  v_k   uuid := (select id from public.clinics where slug = 'krishna-karimnagar');
  v_n   int;
  v_row public.notifications;
begin
  delete from public.subscriptions where clinic_id = v_k;
  insert into public.subscriptions (clinic_id, plan_code, status, trial_ends_at, current_period_start, current_period_end)
  values (v_k, 'starter', 'trialing', now() + interval '20 hours', now() - interval '13 days', now() + interval '20 hours');
  perform public.enqueue_scheduled_notifications();
  perform public.enqueue_scheduled_notifications();
  select count(*) into v_n from public.notifications where clinic_id = v_k and kind = 'trial.ending' and (payload->>'days')::int = 1;
  perform pg_temp.check('a trial ending tomorrow sends one reminder, however often the job runs', v_n = 1);

  update public.subscriptions set current_period_end = now() - interval '1 hour' where clinic_id = v_k;
  perform public.enqueue_scheduled_notifications();
  select count(*) into v_n from public.notifications where clinic_id = v_k and kind = 'subscription.lapsed';
  perform pg_temp.check('a lapsed trial is told when patient features stop', v_n = 1);

  update public.notifications set status = 'sent' where status = 'queued' and id <> (
    select id from public.notifications where clinic_id = v_k and kind = 'subscription.lapsed');
  select * into v_row from public.claim_notifications(10) limit 1;
  perform pg_temp.check('the sender claims what is due', v_row.kind = 'subscription.lapsed' and v_row.status = 'sending' and v_row.attempts = 1);
  select count(*) into v_n from public.claim_notifications(10);
  perform pg_temp.check('a claimed email is not handed out twice', v_n = 0);
  perform public.finish_notification(v_row.id, false, null, 'provider down');
  select * into v_row from public.notifications where id = v_row.id;
  perform pg_temp.check('a failed send is retried later', v_row.status = 'queued' and v_row.send_after > now());
  update public.notifications set send_after = now() where id = v_row.id;
  perform public.claim_notifications(10);
  perform public.finish_notification(v_row.id, true, 'msg_1', null);
  select * into v_row from public.notifications where id = v_row.id;
  perform pg_temp.check('a sent email is marked sent', v_row.status = 'sent' and v_row.provider_message_id = 'msg_1');
end $t$;
