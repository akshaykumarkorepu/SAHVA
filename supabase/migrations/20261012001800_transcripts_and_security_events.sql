-- ============================================================================
-- SAHVA · Call transcript retention and access, and the security event log
--
-- Transcripts are the most sensitive thing the AI produces: patients say
-- what is wrong with them on the phone. So:
--   * each clinic keeps them for a set time (default 90 days, 30–365), after
--     which the words are deleted — turns, tool arguments, summaries and the
--     recording link — and the call row keeps only its outcome and timings;
--   * the owner can hide full transcripts from receptionists;
--   * every transcript opened is logged (call_access_log), and in the
--     patient's own access log when the call is linked to a patient.
--
-- security_events records what an attacker or a mistake looks like from the
-- outside: failed sign-ins, denied access, rate limiting, invalid patient
-- links, and staff role changes. Admin-only, append-only.
-- ============================================================================

-- --- Retention and visibility settings ------------------------------------------------
alter table public.clinic_settings
  add column transcript_retention_days integer not null default 90 check (transcript_retention_days between 30 and 365),
  add column receptionists_see_transcripts boolean not null default true;

alter table public.calls add column transcript_purged_at timestamptz;

-- Receptionists see transcripts only if the owner allows it. Everyone in the
-- clinic still sees the call itself (time, outcome, who called).
create or replace function sahva.can_read_transcripts(p_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select sahva.has_role(p_clinic, array['owner', 'manager', 'doctor']::public.staff_role[])
      or (sahva.is_member(p_clinic)
          and coalesce((select receptionists_see_transcripts from public.clinic_settings where clinic_id = p_clinic), true));
$$;
revoke all on function sahva.can_read_transcripts(uuid) from public;
grant execute on function sahva.can_read_transcripts(uuid) to authenticated, service_role;

drop policy call_turns_select on public.call_turns;
create policy call_turns_select on public.call_turns
  for select to authenticated using (sahva.can_read_transcripts(clinic_id));
drop policy call_tool_invocations_select on public.call_tool_invocations;
create policy call_tool_invocations_select on public.call_tool_invocations
  for select to authenticated using (sahva.can_read_transcripts(clinic_id));
drop policy call_summaries_select on public.call_summaries;
create policy call_summaries_select on public.call_summaries
  for select to authenticated using (sahva.can_read_transcripts(clinic_id));

-- --- Who opened a transcript --------------------------------------------------------------
create table public.call_access_log (
  id            uuid primary key default extensions.gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  call_id       uuid not null references public.calls(id) on delete cascade,
  actor_user_id uuid not null,
  request_id    text check (length(request_id) <= 64),
  accessed_at   timestamptz not null default now()
);
create index call_access_log_call_idx on public.call_access_log (call_id, accessed_at desc);
alter table public.call_access_log enable row level security;
create policy call_access_log_select on public.call_access_log
  for select to authenticated
  using (sahva.has_role(clinic_id, array['owner', 'manager']::public.staff_role[]));
revoke insert, update, delete on public.call_access_log from authenticated, anon;
create trigger call_access_log_append_only before update or delete on public.call_access_log
  for each row execute function sahva.reject_log_change();

alter table public.record_access_log drop constraint record_access_log_record_type_check;
alter table public.record_access_log add constraint record_access_log_record_type_check
  check (record_type in ('medical_record', 'patient_profile', 'call_transcript'));

/**
 * Record that the caller is opening a call's transcript, before it is served.
 * Works out the reader from the session; refuses anyone who may not read it.
 * Returns whether there is still a transcript to show.
 */
create or replace function public.log_call_access(p_call_id uuid, p_request_id text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_call public.calls;
begin
  select * into v_call from public.calls where id = p_call_id;
  if v_call.id is null or auth.uid() is null or not sahva.can_read_transcripts(v_call.clinic_id) then
    raise exception 'Not permitted to read this transcript' using errcode = 'insufficient_privilege';
  end if;
  insert into public.call_access_log (clinic_id, call_id, actor_user_id, request_id)
  values (v_call.clinic_id, v_call.id, auth.uid(), left(p_request_id, 64));
  if v_call.patient_id is not null then
    insert into public.record_access_log (clinic_id, patient_id, actor_type, actor_user_id, record_type, request_id)
    values (v_call.clinic_id, v_call.patient_id, 'staff', auth.uid(), 'call_transcript', left(p_request_id, 64));
  end if;
  return v_call.transcript_purged_at is null;
end;
$$;
revoke all on function public.log_call_access(uuid, text) from public, anon;
grant execute on function public.log_call_access(uuid, text) to authenticated;

-- --- Purging old transcripts -----------------------------------------------------------------
-- call_turns is append-only; the purge is the one exception, and only inside
-- purge_expired_transcripts(), which sets a transaction-local flag.
create or replace function sahva.call_turns_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and current_setting('sahva.retention_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'call_turns is append-only' using errcode = 'insufficient_privilege';
end;
$$;
drop trigger call_turns_append_only on public.call_turns;
create trigger call_turns_append_only before update or delete on public.call_turns
  for each row execute function sahva.call_turns_guard();

/**
 * Delete the words of calls older than each clinic's retention. Keeps the
 * call row (time, outcome, language, booking link) so analytics still add
 * up. Returns how many calls were purged. Run by the scheduled job.
 */
create or replace function public.purge_expired_transcripts(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_ids uuid[];
begin
  select array_agg(c.id) into v_ids from (
    select c.id
      from public.calls c
      join public.clinic_settings s on s.clinic_id = c.clinic_id
     where c.transcript_purged_at is null
       and c.started_at < now() - make_interval(days => s.transcript_retention_days)
     order by c.started_at
     limit greatest(1, p_limit)) c;
  if v_ids is null then
    return 0;
  end if;

  perform set_config('sahva.retention_purge', 'on', true);
  delete from public.call_turns where call_id = any (v_ids);
  perform set_config('sahva.retention_purge', 'off', true);
  delete from public.call_tool_invocations where call_id = any (v_ids);
  delete from public.call_summaries where call_id = any (v_ids);
  update public.calls set recording_url = null, transcript_purged_at = now() where id = any (v_ids);
  return array_length(v_ids, 1);
end;
$$;
revoke all on function public.purge_expired_transcripts(integer) from public, anon, authenticated;
grant execute on function public.purge_expired_transcripts(integer) to service_role;

-- --- Security events ------------------------------------------------------------------------
create table public.security_events (
  id            uuid primary key default extensions.gen_random_uuid(),
  kind          text not null check (kind in (
                  'auth_failed', 'access_denied', 'rate_limited', 'portal_link_invalid',
                  'admin_denied', 'role_changed', 'member_added', 'member_removed')),
  actor_user_id uuid,
  clinic_id     uuid references public.clinics(id) on delete set null,
  ip            text,
  method        text,
  path          text,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index security_events_time_idx on public.security_events (created_at desc);
create index security_events_kind_idx on public.security_events (kind, created_at desc);
create index security_events_ip_idx on public.security_events (ip, created_at desc) where ip is not null;
alter table public.security_events enable row level security;
revoke all on public.security_events from authenticated, anon;
create trigger security_events_append_only before update or delete on public.security_events
  for each row execute function sahva.reject_log_change();

/** Staff joining, leaving, or changing role — whoever made the change. */
create or replace function sahva.log_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.security_events (kind, actor_user_id, clinic_id, details)
    values ('member_added', auth.uid(), new.clinic_id, jsonb_build_object('staff_id', new.staff_id, 'role', new.role, 'status', new.status));
  elsif tg_op = 'DELETE' then
    insert into public.security_events (kind, actor_user_id, clinic_id, details)
    values ('member_removed', auth.uid(), old.clinic_id, jsonb_build_object('staff_id', old.staff_id, 'role', old.role));
  elsif new.role is distinct from old.role or new.status is distinct from old.status then
    insert into public.security_events (kind, actor_user_id, clinic_id, details)
    values ('role_changed', auth.uid(), new.clinic_id, jsonb_build_object(
      'staff_id', new.staff_id, 'role_before', old.role, 'role_after', new.role,
      'status_before', old.status, 'status_after', new.status));
  end if;
  return null;
end;
$$;
create trigger clinic_members_security_log
  after insert or update of role, status or delete on public.clinic_members
  for each row execute function sahva.log_membership_change();

/**
 * Spikes worth an email now rather than in tomorrow's digest: 20+ failed or
 * denied requests from one address in 15 minutes. Called by the scheduled
 * job; one alert per address per hour.
 */
create or replace function public.enqueue_security_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_n int := 0;
begin
  for r in
    select ip, count(*) as n, array_agg(distinct kind) as kinds
      from public.security_events
     where created_at > now() - interval '15 minutes'
       and kind in ('auth_failed', 'access_denied', 'portal_link_invalid', 'admin_denied', 'rate_limited')
       and ip is not null
     group by ip having count(*) >= 20
  loop
    perform sahva.notify_admins(array[]::public.platform_admin_role[], 'admin.security_alert',
      jsonb_build_object('ip', r.ip, 'count', r.n, 'kinds', r.kinds),
      'admin.security_alert:' || r.ip || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24'));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.enqueue_security_alerts() from public, anon, authenticated;
grant execute on function public.enqueue_security_alerts() to service_role;

-- --- The admins' daily digest now counts security events too -------------------------------
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
      'failed_emails_24h',    (select count(*) from public.notifications where status = 'failed' and created_at > now() - interval '1 day'),
      'auth_failures_24h',    (select count(*) from public.security_events where kind in ('auth_failed', 'admin_denied') and created_at > now() - interval '1 day'),
      'access_denied_24h',    (select count(*) from public.security_events where kind in ('access_denied', 'portal_link_invalid') and created_at > now() - interval '1 day'),
      'role_changes_24h',     (select count(*) from public.security_events where kind in ('role_changed', 'member_added', 'member_removed') and created_at > now() - interval '1 day')
    ) into v_digest;
    if exists (select 1 from jsonb_each_text(v_digest) where value::int > 0) then
      perform sahva.notify_admins(array['reviewer', 'finance']::public.platform_admin_role[], 'admin.daily_digest',
                                  v_digest || jsonb_build_object('date', v_today), 'admin.digest:' || v_today);
    end if;
  end if;

  return (select count(*) from public.notifications) - v_before;
end;
$$;
