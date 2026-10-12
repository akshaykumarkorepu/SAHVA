-- ============================================================================
-- SAHVA · Admin: clinics, subscription adjustments, notes, and the grace rule
--
-- 1. admin_clinic_summaries(): one row per clinic with its subscription and
--    activity figures — counts only, no patient is identifiable. Service role.
-- 2. admin_adjust_subscription(): extend a trial or a paid period by whole
--    days, with a reason, audited in the same transaction. Service role.
-- 3. admin_clinic_notes: what admins wrote about a clinic. Service role.
-- 4. Expiry, as decided: a clinic whose trial or paid period ended keeps
--    working for 3 days of grace, then becomes read-only — its data stays
--    visible to staff, but nothing patient-facing runs until it pays.
--    clinic_is_live() now checks that as well as verification.
-- ============================================================================

-- 4 ---------------------------------------------------------------------------
create or replace function sahva.clinic_is_live(p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.verification_status = 'approved'
            and (
              -- Clinics from before subscriptions existed carry none: live.
              not exists (select 1 from public.subscriptions s where s.clinic_id = c.id)
              or exists (
                select 1 from public.subscriptions s
                 where s.clinic_id = c.id
                   and s.status in ('trialing', 'active', 'past_due')
                   and s.current_period_end + interval '3 days' > now()
              )
            )
       from public.clinics c where c.id = p_clinic_id),
    false);
$$;

comment on function sahva.clinic_is_live is
  'Approved, and paid or on trial (or within 3 days after either ended). Gates everything patient-facing.';

-- 3 ---------------------------------------------------------------------------
create table public.admin_clinic_notes (
  id            uuid primary key default extensions.gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  admin_user_id uuid not null references public.platform_admins(user_id),
  body          text not null check (length(btrim(body)) between 1 and 2000),
  created_at    timestamptz not null default now()
);
create index admin_clinic_notes_clinic_idx on public.admin_clinic_notes (clinic_id, created_at desc);
alter table public.admin_clinic_notes enable row level security;
revoke all on public.admin_clinic_notes from authenticated, anon;

-- 2 ---------------------------------------------------------------------------
create or replace function public.admin_adjust_subscription(
  p_clinic_id  uuid,
  p_action     text,
  p_days       integer,
  p_note       text,
  p_admin_id   uuid,
  p_request_id text default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.subscriptions;
  v_after  public.subscriptions;
begin
  if not exists (select 1 from public.platform_admins where user_id = p_admin_id and disabled_at is null) then
    raise exception 'Not an active platform admin' using errcode = 'insufficient_privilege';
  end if;
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'Extend by 1 to 90 days' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'A reason is required' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_before from public.subscriptions
   where clinic_id = p_clinic_id and status in ('trialing', 'active', 'past_due')
   for update;
  if v_before.id is null then
    raise exception 'This clinic has no subscription to adjust' using errcode = 'no_data_found';
  end if;

  if p_action = 'extend_trial' then
    if v_before.status <> 'trialing' then
      raise exception 'Only a trial can be extended as a trial' using errcode = 'invalid_parameter_value';
    end if;
    -- From the end, or from now if it already lapsed: extending a lapsed
    -- trial by 7 days gives 7 days, not 7 days in the past.
    update public.subscriptions
       set current_period_end = greatest(current_period_end, now()) + make_interval(days => p_days),
           trial_ends_at      = greatest(current_period_end, now()) + make_interval(days => p_days)
     where id = v_before.id
    returning * into v_after;
  elsif p_action = 'extend_period' then
    if v_before.status <> 'active' then
      raise exception 'Only a paid plan can have its period extended' using errcode = 'invalid_parameter_value';
    end if;
    update public.subscriptions
       set current_period_end = greatest(current_period_end, now()) + make_interval(days => p_days)
     where id = v_before.id
    returning * into v_after;
  else
    raise exception 'Unknown action %', p_action using errcode = 'invalid_parameter_value';
  end if;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, reason, before, after, request_id)
  values (p_admin_id, 'subscription.' || p_action, 'clinic', p_clinic_id::text, btrim(p_note),
          jsonb_build_object('current_period_end', v_before.current_period_end, 'days', p_days),
          jsonb_build_object('current_period_end', v_after.current_period_end),
          p_request_id);

  return v_after;
end;
$$;

revoke all on function public.admin_adjust_subscription(uuid, text, integer, text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_adjust_subscription(uuid, text, integer, text, uuid, text) to service_role;

-- 1 ---------------------------------------------------------------------------
create or replace function public.admin_clinic_summaries()
returns table (
  id                  uuid,
  name                text,
  city                text,
  verification_status public.clinic_verification_status,
  created_at          timestamptz,
  subscription_status public.subscription_status,
  billing_cycle       text,
  current_period_end  timestamptz,
  is_live             boolean,
  staff               integer,
  patients            integer,
  appointments_30d    integer,
  ai_bookings_30d     integer,
  last_appointment_at timestamptz,
  paid_total_paise    bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.city, c.verification_status, c.created_at,
         s.status, s.billing_cycle, s.current_period_end,
         sahva.clinic_is_live(c.id),
         (select count(*)::int from public.clinic_members m where m.clinic_id = c.id and m.status = 'active'),
         (select count(*)::int from public.patients p where p.clinic_id = c.id),
         (select count(*)::int from public.appointments a where a.clinic_id = c.id and a.created_at > now() - interval '30 days'),
         (select count(*)::int from public.appointments a where a.clinic_id = c.id and a.created_at > now() - interval '30 days' and a.source = 'ai_call'),
         (select max(a.created_at) from public.appointments a where a.clinic_id = c.id),
         (select coalesce(sum(sp.amount_paise), 0) from public.subscription_payments sp where sp.clinic_id = c.id and sp.status = 'paid')
    from public.clinics c
    left join lateral (
      select * from public.subscriptions s
       where s.clinic_id = c.id
       order by (s.status in ('trialing', 'active', 'past_due')) desc, s.created_at desc
       limit 1
    ) s on true
   order by c.created_at desc;
$$;

revoke all on function public.admin_clinic_summaries() from public, anon, authenticated;
grant execute on function public.admin_clinic_summaries() to service_role;
