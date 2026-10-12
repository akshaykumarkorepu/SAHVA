-- ============================================================================
-- SAHVA · Who read a patient's record
--
-- docs/security.md listed this under "Not yet addressed": writes were logged,
-- but who *viewed* a patient's medical record was not. For health data that
-- is the question that matters after the fact.
--
-- record_access_log is append-only and written only through
-- log_record_access(), which works out the reader from the session — a staff
-- member of the patient's clinic, or the patient's own account — so the API
-- cannot record a read against someone else, and a stranger cannot record one
-- at all. Owners and managers can read their clinic's log; nobody else can.
-- ============================================================================

create table public.record_access_log (
  id            uuid primary key default extensions.gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  patient_id    uuid not null,
  actor_type    public.actor_type not null check (actor_type in ('staff', 'patient')),
  actor_user_id uuid not null,
  record_type   text not null check (record_type in ('medical_record', 'patient_profile')),
  request_id    text check (length(request_id) <= 64),
  accessed_at   timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id) on delete cascade
);

create index record_access_log_patient_idx on public.record_access_log (patient_id, accessed_at desc);
create index record_access_log_clinic_idx  on public.record_access_log (clinic_id, accessed_at desc);

alter table public.record_access_log enable row level security;

create policy record_access_log_select on public.record_access_log
  for select to authenticated
  using (sahva.has_role(clinic_id, array['owner', 'manager']::public.staff_role[]));

revoke insert, update, delete on public.record_access_log from authenticated, anon;

create or replace function sahva.reject_log_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'record_access_log is append-only' using errcode = 'insufficient_privilege';
end;
$$;

create trigger record_access_log_append_only
  before update or delete on public.record_access_log
  for each row execute function sahva.reject_log_change();

create or replace function public.log_record_access(
  p_patient_id  uuid,
  p_record_type text,
  p_request_id  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_clinic uuid;
  v_actor  public.actor_type;
begin
  select clinic_id into v_clinic from public.patients where id = p_patient_id;
  if v_uid is null or v_clinic is null then
    raise exception 'Cannot record access' using errcode = 'insufficient_privilege';
  end if;

  if sahva.is_member(v_clinic) then
    v_actor := 'staff';
  elsif exists (select 1 from public.patients where id = p_patient_id and auth_user_id = v_uid) then
    v_actor := 'patient';
  else
    raise exception 'Not permitted to read this patient''s record' using errcode = 'insufficient_privilege';
  end if;

  insert into public.record_access_log (clinic_id, patient_id, actor_type, actor_user_id, record_type, request_id)
  values (v_clinic, p_patient_id, v_actor, v_uid, p_record_type, p_request_id);
end;
$$;

revoke all on function public.log_record_access(uuid, text, text) from public, anon;
grant execute on function public.log_record_access(uuid, text, text) to authenticated;

comment on table public.record_access_log is
  'Append-only: every read of a patient''s medical record or profile, and who made it. Readable by owners and managers.';
