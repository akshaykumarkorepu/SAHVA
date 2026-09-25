-- ============================================================================
-- SAHVA · 1200 · Access predicates
-- Every RLS policy in migration 1500 resolves through these three functions.
-- They are SECURITY DEFINER so they can read clinic_members without invoking
-- clinic_members' own policy, which would recurse. For that to hold,
-- clinic_members must never have FORCE ROW LEVEL SECURITY set.
-- ============================================================================

create or replace function sahva.current_clinic_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.clinic_id
  from public.clinic_members m
  where m.staff_id = (select auth.uid())
    and m.status = 'active';
$$;

create or replace function sahva.is_member(p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clinic_members m
    where m.clinic_id = p_clinic_id
      and m.staff_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function sahva.has_role(p_clinic_id uuid, p_roles public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clinic_members m
    where m.clinic_id = p_clinic_id
      and m.staff_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any(p_roles)
  );
$$;

-- The voice agent runs as service_role (a telephony webhook carries no user
-- JWT), which bypasses RLS entirely. Every SECURITY DEFINER write below still
-- gates on this so a logged-in receptionist cannot act on another clinic.
create or replace function sahva.assert_clinic_access(p_clinic_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claims', true) is null then
    return;                                    -- direct/psql or trusted job
  end if;
  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  if not sahva.is_member(p_clinic_id) then
    raise exception 'Not a member of clinic %', p_clinic_id
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke all on function sahva.current_clinic_ids()   from public;
revoke all on function sahva.is_member(uuid)        from public;
revoke all on function sahva.has_role(uuid, public.staff_role[]) from public;
revoke all on function sahva.assert_clinic_access(uuid) from public;
grant execute on function sahva.current_clinic_ids()   to authenticated, service_role;
grant execute on function sahva.is_member(uuid)        to authenticated, service_role;
grant execute on function sahva.has_role(uuid, public.staff_role[]) to authenticated, service_role;
grant execute on function sahva.assert_clinic_access(uuid) to authenticated, service_role;

comment on function sahva.current_clinic_ids() is
  'Single source of truth for tenant scope. Change the membership rule here and every policy follows.';
