-- ============================================================================
-- SAHVA · Break-glass support access, opened by the clinic
--
-- SAHVA admins see counts, never patients. When support genuinely needs to
-- look at a patient's details to fix a problem, the clinic's owner opens
-- access from Settings for a few hours (at most 72) with a reason, and can
-- close it at any time. There is no way for an admin to open it themselves.
--
-- While it is open, support admins can find a patient and see their profile
-- and appointments — not medical records. Every search and every record
-- opened is written to admin_audit_log, and each record opened also to the
-- clinic's own record_access_log, so the owner sees exactly who looked.
-- ============================================================================

create table public.support_access_grants (
  id          uuid primary key default extensions.gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  granted_by  uuid not null references public.staff_profiles(id),
  reason      text not null check (length(btrim(reason)) between 3 and 500),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  revoked_by  uuid references public.staff_profiles(id),
  check (expires_at > created_at and expires_at <= created_at + interval '72 hours')
);
create index support_access_grants_clinic_idx on public.support_access_grants (clinic_id, created_at desc);
alter table public.support_access_grants enable row level security;
create policy support_access_grants_select on public.support_access_grants
  for select to authenticated
  using (sahva.has_role(clinic_id, array['owner', 'manager']::public.staff_role[]));
revoke insert, update, delete on public.support_access_grants from authenticated, anon;

alter table public.record_access_log drop constraint record_access_log_actor_type_check;
alter table public.record_access_log
  add constraint record_access_log_actor_type_check check (actor_type in ('staff', 'patient', 'support'));

/** The clinic's open grant, if any. */
create or replace function sahva.active_support_grant(p_clinic uuid)
returns public.support_access_grants
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.support_access_grants
   where clinic_id = p_clinic and revoked_at is null and expires_at > now()
   order by expires_at desc limit 1;
$$;

/** The owner opens access for 1–72 hours. One open grant at a time. */
create or replace function public.grant_support_access(p_clinic uuid, p_hours integer, p_reason text)
returns public.support_access_grants
language plpgsql
security definer
set search_path = ''
as $$
declare v_g public.support_access_grants;
begin
  if not sahva.has_role(p_clinic, array['owner']::public.staff_role[]) then
    raise exception 'Only the clinic owner can open access for SAHVA support' using errcode = 'insufficient_privilege';
  end if;
  if p_hours not between 1 and 72 then
    raise exception 'Open access for 1 to 72 hours' using errcode = 'invalid_parameter_value';
  end if;
  if (sahva.active_support_grant(p_clinic)).id is not null then
    raise exception 'Support access is already open; close it first' using errcode = 'unique_violation';
  end if;
  insert into public.support_access_grants (clinic_id, granted_by, reason, expires_at)
  values (p_clinic, auth.uid(), btrim(p_reason), now() + make_interval(hours => p_hours))
  returning * into v_g;
  perform sahva.notify_admins(array['support']::public.platform_admin_role[], 'admin.support_access_granted',
    jsonb_build_object('clinic_id', p_clinic, 'reason', v_g.reason, 'expires_at', v_g.expires_at),
    'admin.support_access:' || v_g.id, p_clinic);
  return v_g;
end;
$$;

create or replace function public.revoke_support_access(p_grant uuid)
returns public.support_access_grants
language plpgsql
security definer
set search_path = ''
as $$
declare v_g public.support_access_grants;
begin
  select * into v_g from public.support_access_grants where id = p_grant for update;
  if v_g.id is null or not sahva.has_role(v_g.clinic_id, array['owner']::public.staff_role[]) then
    raise exception 'Only the clinic owner can close support access' using errcode = 'insufficient_privilege';
  end if;
  update public.support_access_grants set revoked_at = coalesce(revoked_at, now()), revoked_by = coalesce(revoked_by, auth.uid())
   where id = p_grant returning * into v_g;
  return v_g;
end;
$$;

revoke all on function public.grant_support_access(uuid, integer, text) from public, anon;
revoke all on function public.revoke_support_access(uuid) from public, anon;
grant execute on function public.grant_support_access(uuid, integer, text) to authenticated;
grant execute on function public.revoke_support_access(uuid) to authenticated;

/**
 * Record a support admin's look at a clinic's patients, before the API
 * serves it. Refuses unless the clinic has access open and the admin is
 * support or a super admin. A patient opened goes in the clinic's own access
 * log too. Returns the grant it relied on.
 */
create or replace function public.admin_log_support_access(
  p_admin_id uuid, p_clinic uuid, p_patient uuid, p_query text, p_request_id text default null
)
returns public.support_access_grants
language plpgsql
security definer
set search_path = ''
as $$
declare v_g public.support_access_grants;
begin
  if not exists (select 1 from public.platform_admins
                  where user_id = p_admin_id and disabled_at is null and role in ('super_admin', 'support')) then
    raise exception 'Only support admins can use clinic-granted access' using errcode = 'insufficient_privilege';
  end if;
  v_g := sahva.active_support_grant(p_clinic);
  if v_g.id is null then
    raise exception 'This clinic has not opened access for SAHVA support' using errcode = 'insufficient_privilege';
  end if;
  if p_patient is not null then
    if not exists (select 1 from public.patients where id = p_patient and clinic_id = p_clinic) then
      raise exception 'Unknown patient' using errcode = 'no_data_found';
    end if;
    insert into public.record_access_log (clinic_id, patient_id, actor_type, actor_user_id, record_type, request_id)
    values (p_clinic, p_patient, 'support', p_admin_id, 'patient_profile', left(p_request_id, 64));
  end if;
  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, reason, after, request_id)
  values (p_admin_id, case when p_patient is null then 'support.search_patients' else 'support.view_patient' end,
          'clinic', p_clinic::text, v_g.reason,
          jsonb_build_object('grant', v_g.id, 'patient', p_patient, 'query', p_query), p_request_id);
  return v_g;
end;
$$;
revoke all on function public.admin_log_support_access(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_log_support_access(uuid, uuid, uuid, text, text) to service_role;
