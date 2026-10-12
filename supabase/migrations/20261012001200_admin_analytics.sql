-- ============================================================================
-- SAHVA · Admin analytics
--
-- admin_monthly_metrics(n)  the last n months, one row each: growth, money,
--                           and platform-wide patient activity (counts only)
-- admin_clinic_signals()    per clinic, the raw signals the health score is
--                           built from (the scoring itself lives in the API,
--                           where it is unit tested)
--
-- MRR for a month is rebuilt from the payment ledger, not from today's
-- subscriptions: what paid periods covered the last moment of that month,
-- monthly at its amount, yearly at a twelfth, less anything refunded.
-- Service role only; no patient is identifiable in either.
-- ============================================================================

create or replace function public.admin_monthly_metrics(p_months integer default 6)
returns table (
  month             date,
  new_clinics       integer,
  approved          integer,
  first_payments    integer,
  collected_paise   bigint,
  refunded_paise    bigint,
  mrr_paise         bigint,
  paying_clinics    integer,
  new_patients      integer,
  appointments      integer,
  ai_bookings       integer,
  completed         integer,
  no_shows          integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with months as (
    select m::date as month,
           m as m_start,
           least(m + interval '1 month', now()) as m_end
      from generate_series(date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1),
                           date_trunc('month', now()), interval '1 month') m
  ),
  first_paid as (
    select clinic_id, min(paid_at) as at from public.subscription_payments where status = 'paid' group by clinic_id
  )
  select
    mo.month,
    (select count(*)::int from public.clinics c where c.created_at >= mo.m_start and c.created_at < mo.m_end),
    (select count(distinct a.target_id)::int from public.admin_audit_log a
      where a.action = 'clinic.approve' and a.created_at >= mo.m_start and a.created_at < mo.m_end),
    (select count(*)::int from first_paid f where f.at >= mo.m_start and f.at < mo.m_end),
    (select coalesce(sum(coalesce(p.captured_paise, p.amount_paise)), 0) from public.subscription_payments p
      where p.status = 'paid' and p.paid_at >= mo.m_start and p.paid_at < mo.m_end),
    (select coalesce(sum(r.amount_paise), 0) from public.refunds r
      where r.status <> 'failed' and r.created_at >= mo.m_start and r.created_at < mo.m_end),
    (select coalesce(round(sum(
              (coalesce(p.captured_paise, p.amount_paise) - p.refunded_paise)
              / case p.billing_cycle when 'yearly' then 12.0 else 1.0 end)), 0)::bigint
       from public.subscription_payments p
      where p.status = 'paid' and p.period_start <= mo.m_end - interval '1 second' and p.period_end > mo.m_end - interval '1 second'
        and p.refunded_paise < coalesce(p.captured_paise, p.amount_paise)),
    (select count(distinct p.clinic_id)::int from public.subscription_payments p
      where p.status = 'paid' and p.period_start <= mo.m_end - interval '1 second' and p.period_end > mo.m_end - interval '1 second'
        and p.refunded_paise < coalesce(p.captured_paise, p.amount_paise)),
    (select count(*)::int from public.patients pt where pt.created_at >= mo.m_start and pt.created_at < mo.m_end),
    (select count(*)::int from public.appointments ap where ap.starts_at >= mo.m_start and ap.starts_at < mo.m_end and ap.status <> 'cancelled'),
    (select count(*)::int from public.appointments ap where ap.starts_at >= mo.m_start and ap.starts_at < mo.m_end and ap.source = 'ai_call' and ap.status <> 'cancelled'),
    (select count(*)::int from public.appointments ap where ap.starts_at >= mo.m_start and ap.starts_at < mo.m_end and ap.status = 'completed'),
    (select count(*)::int from public.appointments ap where ap.starts_at >= mo.m_start and ap.starts_at < mo.m_end and ap.status = 'no_show')
  from months mo
  order by mo.month;
$$;

revoke all on function public.admin_monthly_metrics(integer) from public, anon, authenticated;
grant execute on function public.admin_monthly_metrics(integer) to service_role;

create or replace function public.admin_clinic_signals()
returns table (
  id                   uuid,
  name                 text,
  city                 text,
  verification_status  public.clinic_verification_status,
  subscription_status  public.subscription_status,
  current_period_end   timestamptz,
  ever_paid            boolean,
  bookings_14d         integer,
  bookings_prev_14d    integer,
  open_actions         integer,
  oldest_action_at     timestamptz,
  last_staff_sign_in   timestamptz,
  created_at           timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.city, c.verification_status, s.status, s.current_period_end,
         exists (select 1 from public.subscription_payments p where p.clinic_id = c.id and p.status = 'paid'),
         (select count(*)::int from public.appointments a where a.clinic_id = c.id and a.created_at > now() - interval '14 days'),
         (select count(*)::int from public.appointments a where a.clinic_id = c.id
            and a.created_at > now() - interval '28 days' and a.created_at <= now() - interval '14 days'),
         (select count(*)::int from public.action_items ai where ai.clinic_id = c.id and ai.status in ('open', 'in_progress')),
         (select min(ai.created_at) from public.action_items ai where ai.clinic_id = c.id and ai.status in ('open', 'in_progress')),
         (select max(u.last_sign_in_at) from public.clinic_members m join auth.users u on u.id = m.staff_id
           where m.clinic_id = c.id and m.status = 'active'),
         c.created_at
    from public.clinics c
    left join lateral (
      select * from public.subscriptions s where s.clinic_id = c.id
       order by (s.status in ('trialing', 'active', 'past_due')) desc, s.created_at desc limit 1
    ) s on true;
$$;

revoke all on function public.admin_clinic_signals() from public, anon, authenticated;
grant execute on function public.admin_clinic_signals() to service_role;
