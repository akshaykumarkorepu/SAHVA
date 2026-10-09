-- ============================================================================
-- SAHVA · 1700 · Patient portal
--
-- Patients in this segment do not install apps and do not remember passwords.
-- The portal is therefore reached by a capability link sent over WhatsApp:
-- tapping it proves possession of the phone the clinic already has on file.
--
-- The link is a bearer credential, so it is treated like one — stored hashed,
-- scoped to a single patient at a single clinic, expiring, and revocable.
-- ============================================================================

-- What a patient is allowed to do for themselves. Per clinic, because a clinic
-- that lets patients cancel online is making a real operational choice.
alter table public.clinic_settings
  add column portal_enabled          boolean not null default true,
  add column patient_may_reschedule  boolean not null default true,
  add column patient_may_cancel      boolean not null default false,
  add column portal_link_ttl_days    smallint not null default 30
    check (portal_link_ttl_days between 1 and 365);

comment on column public.clinic_settings.patient_may_cancel is
  'Off by default, like ai_may_cancel. A cancellation a clinic never hears about is a lost slot.';

-- ---------------------------------------------------------------------------
-- patient_access_tokens
-- ---------------------------------------------------------------------------
create table public.patient_access_tokens (
  id           uuid primary key default extensions.gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,

  -- SHA-256 of the raw token. The raw value is returned once at issue time and
  -- never stored, so a database leak does not hand over working portal links.
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),

  label        text,
  issued_by    uuid references public.staff_profiles(id) on delete set null,
  issued_via   public.message_channel,

  expires_at   timestamptz not null,
  last_used_at timestamptz,
  use_count    integer not null default 0 check (use_count >= 0),
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),

  check (expires_at > created_at),
  foreign key (patient_id, clinic_id)
    references public.patients(id, clinic_id) on delete cascade
);

create index patient_access_tokens_patient_idx
  on public.patient_access_tokens (patient_id, expires_at desc);
create index patient_access_tokens_clinic_idx
  on public.patient_access_tokens (clinic_id, created_at desc);

comment on table public.patient_access_tokens is
  'Capability links for the patient portal. One patient, one clinic, time-limited, revocable.';

-- ---------------------------------------------------------------------------
-- Resolution
-- ---------------------------------------------------------------------------

/**
 * Resolve a portal token to its patient.
 *
 * Lives in `public` because PostgREST only exposes that schema, and the API
 * reaches it as an RPC. Safety comes from the grant: EXECUTE is revoked from
 * everyone and given to service_role alone, so the anon key cannot call it.
 *
 * Returns nothing for an unknown, expired or revoked token — the caller cannot
 * tell which, so a bad link leaks no information about whether it ever existed.
 * Records the use, so an abandoned link is visible in the audit trail.
 */
create or replace function public.resolve_patient_token(p_token_hash text)
returns table (patient_id uuid, clinic_id uuid, token_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.patient_access_tokens t
     set last_used_at = now(),
         use_count = t.use_count + 1
   where t.token_hash = p_token_hash
     and t.revoked_at is null
     and t.expires_at > now()
  returning t.patient_id, t.clinic_id, t.id;
end;
$$;

revoke all on function public.resolve_patient_token(text) from public, anon, authenticated;
grant execute on function public.resolve_patient_token(text) to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.patient_access_tokens enable row level security;

-- Staff can see and revoke their clinic's links. Issuing goes through
-- service_role, because the raw token must never round-trip via the browser.
create policy patient_access_tokens_select on public.patient_access_tokens
  for select to authenticated
  using (clinic_id in (select sahva.current_clinic_ids()));

create policy patient_access_tokens_update on public.patient_access_tokens
  for update to authenticated
  using      (clinic_id in (select sahva.current_clinic_ids()))
  with check (clinic_id in (select sahva.current_clinic_ids()));

-- ---------------------------------------------------------------------------
-- A view of what a patient may see about themselves.
--
-- Deliberately narrow: appointment logistics and nothing clinical. A portal
-- link forwarded to the wrong person must not expose a diagnosis.
-- ---------------------------------------------------------------------------
create view public.v_patient_appointments
with (security_invoker = true) as
select
  a.id,
  a.clinic_id,
  a.patient_id,
  a.starts_at,
  a.ends_at,
  a.duration_min,
  a.status,
  a.reason,
  a.token_number,
  a.cancelled_at,
  a.confirmed_at,
  d.spoken_name  as doctor_name,
  d.specialty    as doctor_specialty,
  d.colour_hex   as doctor_colour,
  d.consult_fee_paise,
  c.name         as clinic_name,
  c.phone_e164   as clinic_phone,
  c.address_line,
  c.landmark,
  c.city,
  c.map_url,
  c.timezone
from public.appointments a
join public.doctors d on d.id = a.doctor_id
join public.clinics c on c.id = a.clinic_id;

comment on view public.v_patient_appointments is
  'Everything the patient portal may read. Logistics only — no notes, no diagnosis, no clinical history.';
