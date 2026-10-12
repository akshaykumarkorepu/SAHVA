-- ============================================================================
-- SAHVA · Platform admins and their audit log
--
-- The people who run SAHVA (approve clinics, handle payments) are not clinic
-- staff, and must never be: one login carrying both a clinic role and
-- platform power would let a clinic owner reach every other clinic.
--
-- platform_admins and admin_audit_log are invisible to every client role.
-- The API reads them with the service role, after checking the caller is an
-- admin signed in with a second factor (aal2). Every admin action is written
-- to admin_audit_log, which nothing can edit or delete.
--
-- First admin: create the user in Supabase → Authentication (email +
-- password), then in the SQL editor:
--   select sahva.grant_platform_admin('you@example.com', 'super_admin', 'Your Name');
-- ============================================================================

create type public.platform_admin_role as enum ('super_admin', 'reviewer', 'finance', 'support', 'analyst');

create table public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        public.platform_admin_role not null,
  full_name   text not null check (length(btrim(full_name)) between 2 and 100),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.platform_admins(user_id) on delete set null,
  disabled_at timestamptz
);

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from authenticated, anon;

create table public.admin_audit_log (
  id            uuid primary key default extensions.gen_random_uuid(),
  admin_user_id uuid not null references public.platform_admins(user_id),
  action        text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type   text,
  target_id     text,
  reason        text,
  before        jsonb,
  after         jsonb,
  request_id    text,
  created_at    timestamptz not null default now()
);

create index admin_audit_log_time_idx   on public.admin_audit_log (created_at desc);
create index admin_audit_log_target_idx on public.admin_audit_log (target_type, target_id, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from authenticated, anon;

create trigger admin_audit_log_append_only
  before update or delete on public.admin_audit_log
  for each row execute function sahva.reject_log_change();

-- One login, one kind of power ---------------------------------------------------
-- Two functions, not one: PL/pgSQL resolves NEW's fields even inside a
-- branch that cannot run, so one function cannot name both tables' columns.
create or replace function sahva.forbid_admin_joining_clinic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.platform_admins where user_id = new.staff_id) then
    raise exception 'A platform admin cannot join a clinic' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function sahva.forbid_member_becoming_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.clinic_members where staff_id = new.user_id) then
    raise exception 'A clinic member cannot be a platform admin' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger platform_admins_no_clinic
  before insert or update of user_id on public.platform_admins
  for each row execute function sahva.forbid_member_becoming_admin();

create trigger clinic_members_no_admin
  before insert or update of staff_id on public.clinic_members
  for each row execute function sahva.forbid_admin_joining_clinic();

-- Bootstrap ---------------------------------------------------------------------
create or replace function sahva.grant_platform_admin(p_email text, p_role public.platform_admin_role, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(btrim(p_email));
  if v_uid is null then
    raise exception 'No user with email % — create them in Authentication first', p_email;
  end if;
  insert into public.platform_admins (user_id, role, full_name)
  values (v_uid, p_role, p_full_name)
  on conflict (user_id) do update set role = excluded.role, full_name = excluded.full_name, disabled_at = null;
  return v_uid;
end;
$$;

-- Only from the SQL editor / service role — never from an app session.
revoke all on function sahva.grant_platform_admin(text, public.platform_admin_role, text) from public, anon, authenticated;
