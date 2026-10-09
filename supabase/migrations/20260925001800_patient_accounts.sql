-- ============================================================================
-- SAHVA · 1800 · Patient accounts and medical history access
--
-- Two tiers of patient access, deliberately:
--
--   portal link  → appointment logistics only. Low blast radius if the
--                  WhatsApp message is forwarded to the wrong person.
--   signed in    → the above plus medical history. Requires a password the
--                  patient set themselves.
--
-- The link is what authorises creating the account: holding it already proves
-- possession of the phone number the clinic has on file, which is the same
-- thing an SMS OTP would prove.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Link a patient record to a login
-- ---------------------------------------------------------------------------
alter table public.patients
  add column auth_user_id uuid references auth.users(id) on delete set null,
  add column account_created_at timestamptz;

-- One login per patient record, and one patient record per login *per clinic*.
-- A person treated at two clinics has two patient rows; both may point at the
-- same auth user, and each clinic still sees only its own row.
create unique index patients_auth_user_idx
  on public.patients (clinic_id, auth_user_id)
  where auth_user_id is not null;

comment on column public.patients.auth_user_id is
  'Set when the patient creates a password from their portal link. Null means link-only access.';

-- ---------------------------------------------------------------------------
-- Who am I, as a patient?
--
-- The mirror of sahva.current_clinic_ids(), for the patient side. SECURITY
-- DEFINER so policies can call it without recursing into patients'' own policy.
-- ---------------------------------------------------------------------------
create or replace function sahva.current_patient_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.patients p
  where p.auth_user_id = (select auth.uid())
    and p.auth_user_id is not null;
$$;

revoke all on function sahva.current_patient_ids() from public;
grant execute on function sahva.current_patient_ids() to authenticated, service_role;

comment on function sahva.current_patient_ids() is
  'Patient rows belonging to the signed-in user. Every patient-facing RLS policy resolves through this.';

-- ---------------------------------------------------------------------------
-- Patient-facing read policies
--
-- These are ADDITIONAL to the existing staff policies: Postgres ORs permissive
-- policies together, so staff keep clinic-wide access and a patient gains
-- read-only access to their own rows and nothing else.
--
-- Read-only on purpose. A patient may not edit their own medical record.
-- ---------------------------------------------------------------------------
create policy patients_self_select on public.patients
  for select to authenticated
  using (id in (select sahva.current_patient_ids()));

create policy appointments_patient_select on public.appointments
  for select to authenticated
  using (patient_id in (select sahva.current_patient_ids()));

create policy consultations_patient_select on public.consultations
  for select to authenticated
  using (patient_id in (select sahva.current_patient_ids()));

create policy prescriptions_patient_select on public.prescriptions
  for select to authenticated
  using (patient_id in (select sahva.current_patient_ids()));

create policy prescription_items_patient_select on public.prescription_items
  for select to authenticated
  using (exists (
    select 1 from public.prescriptions rx
    where rx.id = prescription_id
      and rx.patient_id in (select sahva.current_patient_ids())
  ));

create policy patient_conditions_patient_select on public.patient_conditions
  for select to authenticated
  using (patient_id in (select sahva.current_patient_ids()));

create policy patient_vaccinations_patient_select on public.patient_vaccinations
  for select to authenticated
  using (patient_id in (select sahva.current_patient_ids()));

create policy patient_invoices_patient_select on public.patient_invoices
  for select to authenticated
  using (patient_id in (select sahva.current_patient_ids()));

create policy patient_invoice_items_patient_select on public.patient_invoice_items
  for select to authenticated
  using (exists (
    select 1 from public.patient_invoices i
    where i.id = invoice_id
      and i.patient_id in (select sahva.current_patient_ids())
  ));

-- The clinic a patient attends, so the portal can show address and phone.
create policy clinics_patient_select on public.clinics
  for select to authenticated
  using (
    id in (
      select p.clinic_id from public.patients p
      where p.id in (select sahva.current_patient_ids())
    )
  );

create policy doctors_patient_select on public.doctors
  for select to authenticated
  using (
    clinic_id in (
      select p.clinic_id from public.patients p
      where p.id in (select sahva.current_patient_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- The medical record, as the patient sees it
--
-- A finalised consultation only. A doctor's draft notes are working material
-- and must not appear in a patient's app the moment they are typed.
-- ---------------------------------------------------------------------------
create view public.v_patient_medical_history
with (security_invoker = true) as
select
  c.id,
  c.clinic_id,
  c.patient_id,
  c.appointment_id,
  c.chief_complaint,
  c.diagnosis_text,
  c.advice,
  c.follow_up_days,
  c.finalised_at,
  a.starts_at          as visited_at,
  d.spoken_name        as doctor_name,
  d.specialty          as doctor_specialty,
  d.colour_hex         as doctor_colour
from public.consultations c
join public.doctors d on d.id = c.doctor_id
left join public.appointments a on a.id = c.appointment_id
where c.status = 'finalised';

comment on view public.v_patient_medical_history is
  'Finalised visit notes only. Drafts stay with the doctor until they are signed off.';

create view public.v_patient_prescriptions
with (security_invoker = true) as
select
  rx.id,
  rx.clinic_id,
  rx.patient_id,
  rx.consultation_id,
  rx.issued_at,
  rx.notes,
  d.spoken_name as doctor_name,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'drug_name', i.drug_name,
        'strength', i.strength,
        'form', i.form,
        'dosage', i.dosage,
        'frequency', i.frequency,
        'duration_days', i.duration_days,
        'instructions_en', i.instructions_en,
        'instructions_te', i.instructions_te
      )
      order by i.sort_order
    ) filter (where i.id is not null),
    '[]'::jsonb
  ) as items
from public.prescriptions rx
join public.doctors d on d.id = rx.doctor_id
left join public.prescription_items i on i.prescription_id = rx.id
group by rx.id, rx.clinic_id, rx.patient_id, rx.consultation_id, rx.issued_at, rx.notes, d.spoken_name;

-- ---------------------------------------------------------------------------
-- Claiming an account from a portal link
--
-- Runs as service_role from the API after the link has been verified. Refuses
-- to re-point a patient record that already has an account, so a leaked link
-- cannot be used to hijack one that is already claimed.
-- ---------------------------------------------------------------------------
create or replace function public.claim_patient_account(
  p_patient_id   uuid,
  p_auth_user_id uuid
)
returns public.patients
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient public.patients;
begin
  select * into v_patient from public.patients where id = p_patient_id;

  if v_patient.id is null then
    raise exception 'Unknown patient %', p_patient_id using errcode = 'no_data_found';
  end if;

  if v_patient.auth_user_id is not null and v_patient.auth_user_id <> p_auth_user_id then
    raise exception 'This patient record already has an account'
      using errcode = 'unique_violation',
            hint = 'Ask the clinic to reset access if this is not your account.';
  end if;

  update public.patients
     set auth_user_id = p_auth_user_id,
         account_created_at = coalesce(account_created_at, now())
   where id = p_patient_id
  returning * into v_patient;

  return v_patient;
end;
$$;

revoke all on function public.claim_patient_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_patient_account(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Staff profiles are for staff
--
-- The original trigger created a staff_profiles row for every auth user, which
-- was correct when staff were the only accounts that existed. Patients now sign
-- in too, and a patient must not acquire a staff identity — so profile creation
-- becomes explicit opt-in via account_type in the signup metadata.
-- ---------------------------------------------------------------------------
create or replace function sahva.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Patients are not staff. Anything that is not explicitly staff is ignored.
  if coalesce(new.raw_user_meta_data ->> 'account_type', '') <> 'staff' then
    return new;
  end if;

  insert into public.staff_profiles (id, full_name, phone_e164)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
