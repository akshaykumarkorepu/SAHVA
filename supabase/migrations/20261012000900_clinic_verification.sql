-- ============================================================================
-- SAHVA · Clinic verification
--
-- A clinic is reviewed by a SAHVA admin before anything it does reaches a
-- patient. The owner applies with a government facility identifier — the
-- ABDM Health Facility Registry ID, or the state clinical-establishment
-- registration number — plus the owner doctor's medical council
-- registration, and a certificate. Until approved, the owner can set the
-- clinic up (doctors, hours, FAQs) but nothing patient-facing runs and there
-- is no trial or payment. The 14-day trial starts at approval.
--
-- Decisions are made in admin_review_clinic(), service role only, which
-- writes its own admin_audit_log row in the same transaction: a clinic's
-- status cannot change without the record of who changed it and why.
--
-- Clinics that existed before this migration are grandfathered as approved.
-- ============================================================================

create type public.clinic_verification_status as enum
  ('submitted', 'under_review', 'needs_info', 'approved', 'rejected', 'suspended');

alter table public.clinics
  add column verification_status public.clinic_verification_status not null default 'approved',
  add column hfr_id               text unique check (hfr_id ~ '^[A-Za-z0-9-]{6,32}$'),
  add column establishment_reg_no text check (length(btrim(establishment_reg_no)) between 3 and 64),
  add column registration_state   text,
  add column owner_reg_no         text check (length(btrim(owner_reg_no)) between 3 and 32),
  add column owner_council        text,
  add column gstin                text unique
                                  check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  add column submitted_at         timestamptz,
  add column reviewed_at          timestamptz,
  add column reviewed_by          uuid references public.platform_admins(user_id) on delete set null,
  add column review_note          text,
  add constraint clinics_establishment_reg_unique unique (establishment_reg_no, registration_state),
  -- A clinic awaiting review must carry a facility ID and the owner doctor's
  -- registration. Grandfathered clinics (approved before this) may not.
  add constraint clinics_application_complete check (
    verification_status not in ('submitted', 'under_review')
    or (
      (hfr_id is not null or (establishment_reg_no is not null and registration_state is not null))
      and owner_reg_no is not null and owner_council is not null
    )
  );

-- New clinics start submitted; existing ones keep 'approved' from the default above.
alter table public.clinics alter column verification_status set default 'submitted';

create index clinics_review_queue_idx on public.clinics (verification_status, submitted_at)
  where verification_status in ('submitted', 'under_review', 'needs_info');

-- --- Documents ------------------------------------------------------------------
create table public.clinic_documents (
  id           uuid primary key default extensions.gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  kind         text not null check (kind in ('facility_registration', 'doctor_registration', 'other')),
  storage_path text not null unique,
  file_name    text not null check (length(file_name) <= 200),
  content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes   integer not null check (size_bytes between 1 and 5242880),
  uploaded_by  uuid references public.staff_profiles(id) on delete set null,
  uploaded_at  timestamptz not null default now()
);

create index clinic_documents_clinic_idx on public.clinic_documents (clinic_id, uploaded_at desc);

alter table public.clinic_documents enable row level security;
create policy clinic_documents_select on public.clinic_documents
  for select to authenticated
  using (sahva.has_role(clinic_id, array['owner', 'manager']::public.staff_role[]));
-- Written by the API's service role after it has stored the file.
revoke insert, update, delete on public.clinic_documents from authenticated, anon;

-- The bucket is private: no client role has any policy on it, so files are
-- reachable only through short-lived signed URLs the API issues.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('clinic-documents', 'clinic-documents', false, 5242880,
            array['application/pdf', 'image/jpeg', 'image/png'])
    on conflict (id) do nothing;
  end if;
end
$$;

-- --- Applying -----------------------------------------------------------------------
/**
 * A signed-in staff account applies for its clinic and becomes its owner.
 * The clinic starts 'submitted': set-up is allowed, nothing patient-facing
 * runs, and there is no trial until a SAHVA admin approves it.
 */
create or replace function public.submit_clinic_application(
  p_name          text,
  p_address       text,
  p_city          text,
  p_pincode       text,
  p_phone         text,
  p_hfr_id        text,
  p_est_reg_no    text,
  p_reg_state     text,
  p_owner_reg_no  text,
  p_owner_council text,
  p_gstin         text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_clinic uuid;
  v_slug   text;
begin
  if v_uid is null or not exists (select 1 from public.staff_profiles where id = v_uid) then
    raise exception 'Sign in with a clinic staff account first' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.clinic_members where staff_id = v_uid) then
    raise exception 'This account already belongs to a clinic' using errcode = 'unique_violation';
  end if;

  -- Hyphens trimmed at both ends: a name starting with punctuation used to
  -- produce a slug the slug check refused.
  v_slug := btrim(left(regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'), 40), '-');
  v_slug := coalesce(nullif(v_slug, ''), 'clinic') || '-' || substr(md5(extensions.gen_random_uuid()::text), 1, 6);

  insert into public.clinics (slug, name, address_line, city, pincode, phone_e164, state,
                              hfr_id, establishment_reg_no, registration_state,
                              owner_reg_no, owner_council, gstin,
                              verification_status, submitted_at)
  values (v_slug, btrim(p_name), nullif(btrim(p_address), ''), btrim(p_city), nullif(btrim(p_pincode), ''), p_phone,
          nullif(btrim(p_reg_state), ''),
          nullif(upper(btrim(p_hfr_id)), ''), nullif(btrim(p_est_reg_no), ''), nullif(btrim(p_reg_state), ''),
          nullif(btrim(p_owner_reg_no), ''), nullif(btrim(p_owner_council), ''), nullif(upper(btrim(p_gstin)), ''),
          'submitted', now())
  returning id into v_clinic;

  insert into public.clinic_settings (clinic_id) values (v_clinic);
  insert into public.clinic_members (clinic_id, staff_id, role, status, joined_at)
  values (v_clinic, v_uid, 'owner', 'active', now());

  return v_clinic;
end;
$$;

revoke all on function public.submit_clinic_application(text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_clinic_application(text, text, text, text, text, text, text, text, text, text, text) to authenticated;

/**
 * The owner edits the application while it is waiting or after an admin
 * asked for more information. Editing after "needs info" resubmits it.
 */
create or replace function public.update_clinic_application(
  p_hfr_id        text,
  p_est_reg_no    text,
  p_reg_state     text,
  p_owner_reg_no  text,
  p_owner_council text,
  p_gstin         text
)
returns public.clinics
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic public.clinics;
begin
  select c.* into v_clinic
    from public.clinics c
    join public.clinic_members m on m.clinic_id = c.id
   where m.staff_id = auth.uid() and m.role = 'owner' and m.status = 'active'
   for update of c;
  if v_clinic.id is null then
    raise exception 'Only the clinic owner can change the application' using errcode = 'insufficient_privilege';
  end if;
  if v_clinic.verification_status not in ('submitted', 'needs_info') then
    raise exception 'The application is % and cannot be edited', v_clinic.verification_status
      using errcode = 'invalid_parameter_value';
  end if;

  update public.clinics
     set hfr_id = nullif(upper(btrim(p_hfr_id)), ''),
         establishment_reg_no = nullif(btrim(p_est_reg_no), ''),
         registration_state = nullif(btrim(p_reg_state), ''),
         owner_reg_no = nullif(btrim(p_owner_reg_no), ''),
         owner_council = nullif(btrim(p_owner_council), ''),
         gstin = nullif(upper(btrim(p_gstin)), ''),
         verification_status = 'submitted',
         submitted_at = now()
   where id = v_clinic.id
  returning * into v_clinic;
  return v_clinic;
end;
$$;

revoke all on function public.update_clinic_application(text, text, text, text, text, text) from public, anon;
grant execute on function public.update_clinic_application(text, text, text, text, text, text) to authenticated;

-- The old one-step signup started a trial with no review. It is withdrawn.
revoke all on function public.create_clinic_with_trial(text, text, text) from authenticated;

-- --- Reviewing ---------------------------------------------------------------------
/**
 * The only way a clinic's verification status changes. Service role only;
 * writes admin_audit_log in the same transaction.
 *
 *   start_review: submitted            → under_review
 *   approve:      submitted/under_review → approved (starts the 14-day trial)
 *   needs_info:   submitted/under_review → needs_info   (note required)
 *   reject:       submitted/under_review/needs_info → rejected (note required)
 *   suspend:      approved             → suspended      (note required)
 *   reinstate:    suspended            → approved
 */
create or replace function public.admin_review_clinic(
  p_clinic_id  uuid,
  p_decision   text,
  p_note       text,
  p_admin_id   uuid,
  p_request_id text default null
)
returns public.clinics
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.clinics;
  v_after  public.clinics;
  v_to     public.clinic_verification_status;
  v_from   public.clinic_verification_status[];
begin
  if not exists (select 1 from public.platform_admins where user_id = p_admin_id and disabled_at is null) then
    raise exception 'Not an active platform admin' using errcode = 'insufficient_privilege';
  end if;

  select * into v_before from public.clinics where id = p_clinic_id for update;
  if v_before.id is null then
    raise exception 'Unknown clinic %', p_clinic_id using errcode = 'no_data_found';
  end if;

  case p_decision
    when 'start_review' then v_to := 'under_review'; v_from := array['submitted']::public.clinic_verification_status[];
    when 'approve'      then v_to := 'approved';     v_from := array['submitted','under_review']::public.clinic_verification_status[];
    when 'needs_info'   then v_to := 'needs_info';   v_from := array['submitted','under_review']::public.clinic_verification_status[];
    when 'reject'       then v_to := 'rejected';     v_from := array['submitted','under_review','needs_info']::public.clinic_verification_status[];
    when 'suspend'      then v_to := 'suspended';    v_from := array['approved']::public.clinic_verification_status[];
    when 'reinstate'    then v_to := 'approved';     v_from := array['suspended']::public.clinic_verification_status[];
    else raise exception 'Unknown decision %', p_decision using errcode = 'invalid_parameter_value';
  end case;

  if not (v_before.verification_status = any (v_from)) then
    raise exception 'Cannot % a clinic that is %', replace(p_decision, '_', ' '), v_before.verification_status
      using errcode = 'invalid_parameter_value';
  end if;
  if p_decision in ('needs_info', 'reject', 'suspend') and coalesce(btrim(p_note), '') = '' then
    raise exception 'A reason is required to % a clinic', replace(p_decision, '_', ' ')
      using errcode = 'invalid_parameter_value';
  end if;
  if p_decision = 'approve'
     and not ((v_before.hfr_id is not null or (v_before.establishment_reg_no is not null and v_before.registration_state is not null))
              and v_before.owner_reg_no is not null) then
    raise exception 'Cannot approve without a facility ID and the owner doctor''s registration'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.clinics
     set verification_status = v_to,
         reviewed_at = now(),
         reviewed_by = p_admin_id,
         review_note = nullif(btrim(p_note), ''),
         onboarded_at = case when p_decision = 'approve' then coalesce(onboarded_at, now()) else onboarded_at end
   where id = p_clinic_id
  returning * into v_after;

  -- The trial starts at approval. A clinic approved again after a suspension
  -- keeps whatever subscription it already has.
  if p_decision = 'approve'
     and not exists (select 1 from public.subscriptions where clinic_id = p_clinic_id) then
    insert into public.subscriptions (clinic_id, plan_code, status, trial_ends_at, current_period_start, current_period_end)
    values (p_clinic_id, 'starter', 'trialing', now() + interval '14 days', now(), now() + interval '14 days');
  end if;

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, reason, before, after, request_id)
  values (p_admin_id, 'clinic.' || p_decision, 'clinic', p_clinic_id::text, nullif(btrim(p_note), ''),
          jsonb_build_object('verification_status', v_before.verification_status),
          jsonb_build_object('verification_status', v_after.verification_status),
          p_request_id);

  return v_after;
end;
$$;

revoke all on function public.admin_review_clinic(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_review_clinic(uuid, text, text, uuid, text) to service_role;

-- --- Nothing patient-facing until approved -----------------------------------------
create or replace function sahva.clinic_is_live(p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select verification_status = 'approved' from public.clinics where id = p_clinic_id), false);
$$;

/**
 * Bookings that come from patients or the AI need an approved clinic. Staff
 * can still book while setting up — that is how they test their diary.
 */
create or replace function sahva.guard_patient_facing_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source in ('ai_call', 'whatsapp', 'web') and not sahva.clinic_is_live(new.clinic_id) then
    raise exception 'This clinic is not yet approved to take bookings from patients'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger appointments_require_live_clinic
  before insert on public.appointments
  for each row execute function sahva.guard_patient_facing_booking();

/** Patient appointment links are patient-facing too. */
create or replace function sahva.guard_portal_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not sahva.clinic_is_live(new.clinic_id) then
    raise exception 'This clinic is not yet approved to send patient links' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger patient_access_tokens_require_live_clinic
  before insert on public.patient_access_tokens
  for each row execute function sahva.guard_portal_token();
