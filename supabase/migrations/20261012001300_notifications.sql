-- ============================================================================
-- SAHVA · Notifications: an outbox of emails to clinic owners and admins
--
-- Events are written here by triggers in the same transaction as the change
-- that caused them, so nothing that happened can go unannounced and nothing
-- that rolled back can be announced. A scheduled job (the API's
-- /api/internal/notifications/run) claims queued rows, renders them and
-- sends them through the email provider, retrying with backoff.
--
-- Owners hear about: their application (received, needs info, approved,
-- rejected), suspension and reinstatement, trial or paid period ending
-- (3 days, 1 day), lapse into grace, payments received or failed, refunds.
-- Admins hear about: new and resubmitted applications, payment exceptions
-- (disputes included), refunds waiting for a second approval, and a daily
-- digest of what is waiting.
--
-- Rows hold a kind and a small payload; wording lives in the API
-- (src/lib/notify.ts). No patient data is ever put in a notification.
-- ============================================================================

create table public.notifications (
  id                  uuid primary key default extensions.gen_random_uuid(),
  clinic_id           uuid references public.clinics(id) on delete cascade,
  audience            text not null check (audience in ('clinic', 'admin')),
  kind                text not null check (kind ~ '^[a-z_]+\.[a-z_]+$'),
  to_email            extensions.citext not null,
  to_name             text,
  payload             jsonb not null default '{}'::jsonb,
  -- One email per event per recipient, however often the event is seen.
  dedupe_key          text not null,
  status              text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts            integer not null default 0,
  last_error          text,
  provider_message_id text,
  send_after          timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  unique (dedupe_key, to_email)
);
create index notifications_queue_idx  on public.notifications (send_after) where status in ('queued', 'sending');
create index notifications_clinic_idx on public.notifications (clinic_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from authenticated, anon;

-- --- Recipients -------------------------------------------------------------------------
/** Queue one email to each active owner of a clinic. */
create or replace function sahva.notify_clinic(p_clinic uuid, p_kind text, p_payload jsonb, p_dedupe text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (clinic_id, audience, kind, to_email, to_name, payload, dedupe_key)
  select p_clinic, 'clinic', p_kind, u.email, s.full_name,
         coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('clinic_name', c.name),
         p_dedupe
    from public.clinic_members m
    join public.clinics c on c.id = m.clinic_id
    join public.staff_profiles s on s.id = m.staff_id
    join auth.users u on u.id = m.staff_id
   where m.clinic_id = p_clinic and m.role = 'owner' and m.status = 'active' and u.email is not null
  on conflict (dedupe_key, to_email) do nothing;
$$;

/** Queue one email to each active admin in the given roles (super admins always). */
create or replace function sahva.notify_admins(
  p_roles public.platform_admin_role[], p_kind text, p_payload jsonb, p_dedupe text, p_clinic uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (clinic_id, audience, kind, to_email, to_name, payload, dedupe_key)
  select p_clinic, 'admin', p_kind, u.email, a.full_name,
         coalesce(p_payload, '{}'::jsonb)
           || coalesce((select jsonb_build_object('clinic_name', c.name) from public.clinics c where c.id = p_clinic), '{}'::jsonb),
         p_dedupe
    from public.platform_admins a
    join auth.users u on u.id = a.user_id
   where a.disabled_at is null and u.email is not null
     and (a.role = 'super_admin' or a.role = any (p_roles))
  on conflict (dedupe_key, to_email) do nothing;
$$;

revoke all on function sahva.notify_clinic(uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function sahva.notify_admins(public.platform_admin_role[], text, jsonb, text, uuid) from public, anon, authenticated;

-- --- Application and verification -------------------------------------------------------
-- A deferred constraint trigger: a new clinic's owner joins it after the clinic
-- row is inserted, in the same transaction, so recipients are read at commit.
create or replace function sahva.notify_verification_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.clinic_verification_status := case when tg_op = 'UPDATE' then old.verification_status end;
  v_key text := new.id::text || ':' || coalesce(new.reviewed_at, new.submitted_at, now())::text;
  v_sub public.subscriptions;
begin
  if v_old is not distinct from new.verification_status and tg_op = 'UPDATE' then
    return null;
  end if;

  case new.verification_status
    when 'submitted' then
      perform sahva.notify_clinic(new.id, 'application.received', '{}'::jsonb,
                                  'application.received:' || new.id || ':' || new.submitted_at);
      perform sahva.notify_admins(array['reviewer']::public.platform_admin_role[],
                                  case when v_old = 'needs_info' then 'admin.application_resubmitted' else 'admin.new_application' end,
                                  jsonb_build_object('clinic_id', new.id, 'city', new.city),
                                  'admin.application:' || new.id || ':' || new.submitted_at, new.id);
    when 'needs_info' then
      perform sahva.notify_clinic(new.id, 'application.needs_info', jsonb_build_object('note', new.review_note),
                                  'application.needs_info:' || v_key);
    when 'rejected' then
      perform sahva.notify_clinic(new.id, 'application.rejected', jsonb_build_object('note', new.review_note),
                                  'application.rejected:' || v_key);
    when 'suspended' then
      perform sahva.notify_clinic(new.id, 'clinic.suspended', jsonb_build_object('note', new.review_note),
                                  'clinic.suspended:' || v_key);
    when 'approved' then
      if v_old = 'suspended' then
        perform sahva.notify_clinic(new.id, 'clinic.reinstated', '{}'::jsonb, 'clinic.reinstated:' || v_key);
      elsif v_old is not null then
        select * into v_sub from public.subscriptions where clinic_id = new.id order by created_at desc limit 1;
        perform sahva.notify_clinic(new.id, 'application.approved',
                                    jsonb_build_object('trial_ends_at', v_sub.current_period_end),
                                    'application.approved:' || new.id);
      end if;
    else
      null;  -- under_review: nothing to say yet
  end case;
  return null;
end;
$$;

create constraint trigger clinics_notify_verification
  after insert or update of verification_status on public.clinics
  deferrable initially deferred
  for each row execute function sahva.notify_verification_change();

-- --- Payments and refunds ---------------------------------------------------------------
create or replace function sahva.notify_payment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return null;
  end if;
  if new.status = 'paid' then
    perform sahva.notify_clinic(new.clinic_id, 'payment.received',
      jsonb_build_object('amount_paise', coalesce(new.captured_paise, new.amount_paise), 'billing_cycle', new.billing_cycle,
                         'period_end', new.period_end, 'payment_ref', new.razorpay_payment_id),
      'payment.received:' || new.id);
  elsif new.status = 'failed' then
    perform sahva.notify_clinic(new.clinic_id, 'payment.failed',
      jsonb_build_object('amount_paise', new.amount_paise, 'billing_cycle', new.billing_cycle),
      'payment.failed:' || new.id);
  end if;
  return null;
end;
$$;

create trigger subscription_payments_notify
  after update of status on public.subscription_payments
  for each row execute function sahva.notify_payment_change();

create or replace function sahva.notify_refund_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'processed' and (tg_op = 'INSERT' or old.status <> 'processed') then
    perform sahva.notify_clinic(new.clinic_id, 'refund.processed',
      jsonb_build_object('amount_paise', new.amount_paise, 'refund_ref', new.razorpay_refund_id),
      'refund.processed:' || new.id);
  end if;
  return null;
end;
$$;

create trigger refunds_notify
  after insert or update of status on public.refunds
  for each row execute function sahva.notify_refund_change();

create or replace function sahva.notify_payment_exception()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform sahva.notify_admins(array['finance']::public.platform_admin_role[], 'admin.payment_exception',
    jsonb_build_object('exception_id', new.id, 'exception_kind', new.kind, 'amount_paise', new.amount_paise,
                       'payment_ref', coalesce(new.razorpay_payment_id, new.razorpay_order_id)),
    'admin.payment_exception:' || new.id, new.clinic_id);
  return null;
end;
$$;

-- Signature failures arrive in bursts from one bad sender; the daily digest
-- counts them instead of an email each.
create trigger payment_exceptions_notify
  after insert on public.payment_exceptions
  for each row when (new.kind <> 'signature_failure')
  execute function sahva.notify_payment_exception();

-- --- Time-based: period endings and the admin digest -----------------------------------
/**
 * Queue what is due because time passed: reminders 3 days and 1 day before a
 * trial or paid period ends, a notice on entering the 3-day grace, and the
 * admins' daily digest (from 09:00 IST). Safe to call as often as wanted —
 * every row is deduplicated. Returns how many rows were queued.
 */
create or replace function public.enqueue_scheduled_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before bigint := (select count(*) from public.notifications);
  r        record;
  v_days   int;
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_digest jsonb;
begin
  for r in
    select s.id, s.clinic_id, s.status, s.current_period_end
      from public.subscriptions s
      join public.clinics c on c.id = s.clinic_id
     where c.verification_status = 'approved'
       and s.status in ('trialing', 'active', 'past_due')
       and s.current_period_end > now() - interval '3 days'
       and s.current_period_end < now() + interval '3 days'
  loop
    if r.current_period_end <= now() then
      perform sahva.notify_clinic(r.clinic_id, 'subscription.lapsed',
        jsonb_build_object('ended_at', r.current_period_end, 'stops_at', r.current_period_end + interval '3 days',
                           'was_trial', r.status = 'trialing'),
        'subscription.lapsed:' || r.id || ':' || r.current_period_end);
    else
      v_days := case when r.current_period_end <= now() + interval '1 day' then 1 else 3 end;
      perform sahva.notify_clinic(r.clinic_id,
        case when r.status = 'trialing' then 'trial.ending' else 'subscription.ending' end,
        jsonb_build_object('ends_at', r.current_period_end, 'days', v_days),
        'period.ending:' || v_days || ':' || r.id || ':' || r.current_period_end);
    end if;
  end loop;

  if extract(hour from now() at time zone 'Asia/Kolkata') >= 9 then
    select jsonb_build_object(
      'applications_waiting', (select count(*) from public.clinics where verification_status in ('submitted', 'under_review')),
      'applications_overdue', (select count(*) from public.clinics
                                where verification_status in ('submitted', 'under_review') and submitted_at < now() - interval '2 days'),
      'open_exceptions',      (select count(*) from public.payment_exceptions where status = 'open'),
      'signature_failures_24h', (select count(*) from public.payment_events where not signature_ok and received_at > now() - interval '1 day'),
      'failed_emails_24h',    (select count(*) from public.notifications where status = 'failed' and created_at > now() - interval '1 day')
    ) into v_digest;
    if exists (select 1 from jsonb_each_text(v_digest) where value::int > 0) then
      perform sahva.notify_admins(array['reviewer', 'finance']::public.platform_admin_role[], 'admin.daily_digest',
                                  v_digest || jsonb_build_object('date', v_today), 'admin.digest:' || v_today);
    end if;
  end if;

  return (select count(*) from public.notifications) - v_before;
end;
$$;

-- --- Sending -------------------------------------------------------------------------------
/**
 * Hand the sender a batch: queued rows that are due (and rows stuck in
 * 'sending' for 10 minutes — a sender that died), marked 'sending'. Rows
 * older than 7 days are skipped rather than sent: a "trial ends tomorrow"
 * from last month is worse than nothing.
 */
create or replace function public.claim_notifications(p_limit integer default 50)
returns setof public.notifications
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications
     set status = 'skipped', last_error = 'too old to send'
   where status = 'queued' and created_at < now() - interval '7 days';

  return query
  update public.notifications n
     set status = 'sending', attempts = n.attempts + 1, send_after = now() + interval '10 minutes'
   where n.id in (
     select id from public.notifications
      where (status = 'queued' and send_after <= now())
         or (status = 'sending' and send_after <= now())
      order by created_at
      limit greatest(1, least(p_limit, 200))
      for update skip locked)
  returning n.*;
end;
$$;

/** Record the outcome of one send. Failures retry with backoff, five tries in all. */
create or replace function public.finish_notification(p_id uuid, p_ok boolean, p_message_id text, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set status = case when p_ok then 'sent' when attempts >= 5 then 'failed' else 'queued' end,
         sent_at = case when p_ok then now() end,
         provider_message_id = p_message_id,
         last_error = case when p_ok then null else left(p_error, 500) end,
         send_after = case when p_ok then send_after else now() + attempts * interval '5 minutes' end
   where id = p_id and status = 'sending';
$$;

revoke all on function public.enqueue_scheduled_notifications() from public, anon, authenticated;
revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
revoke all on function public.finish_notification(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.enqueue_scheduled_notifications() to service_role;
grant execute on function public.claim_notifications(integer) to service_role;
grant execute on function public.finish_notification(uuid, boolean, text, text) to service_role;
