-- ============================================================================
-- SAHVA · 1500 · Row Level Security
--
-- Threat model: a clinic owner in Warangal must never, under any query, see a
-- row belonging to a clinic in Karimnagar. Every table is denied by default
-- and opened only through sahva.current_clinic_ids().
--
-- Three access classes:
--   member_rw   — any active member reads and writes (day-to-day operations)
--   admin_w     — members read; only owner/manager writes (configuration)
--   member_ro   — members read; writes only via SECURITY DEFINER functions or
--                 service_role (audit logs, metering, billing)
--
-- FORCE ROW LEVEL SECURITY is deliberately NOT set anywhere: it would break
-- both the SECURITY DEFINER predicate helpers and the service_role bypass the
-- telephony webhook depends on.
-- ============================================================================

-- Nothing in this product is public. Revoke the anon role outright.
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on functions from anon;

do $outer$
declare
  t          text;
  member_rw  text[] := array[
    'patients','appointments','calls','call_summaries',
    'action_items','reschedule_batches','reschedule_batch_items',
    'messages','consultations','prescriptions','patient_conditions',
    'patient_vaccinations','care_tasks','patient_invoices','doctor_time_off'
  ];
  admin_w    text[] := array[
    'clinic_settings','clinic_hours','clinic_closures',
    'doctors','doctor_sessions','clinic_services','clinic_faqs',
    'care_plans','subscriptions'
  ];
  member_ro  text[] := array[
    'appointment_events','call_turns','call_tool_invocations',
    'usage_events','subscription_invoices'
  ];
begin
  -- Read access is identical across all three classes.
  foreach t in array (member_rw || admin_w || member_ro) loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using (clinic_id in (select sahva.current_clinic_ids()))
    $p$, t || '_select', t);
  end loop;

  -- member_rw: any active member may write within their own clinic.
  foreach t in array member_rw loop
    execute format($p$
      create policy %I on public.%I
        for insert to authenticated
        with check (clinic_id in (select sahva.current_clinic_ids()))
    $p$, t || '_insert', t);
    execute format($p$
      create policy %I on public.%I
        for update to authenticated
        using      (clinic_id in (select sahva.current_clinic_ids()))
        with check (clinic_id in (select sahva.current_clinic_ids()))
    $p$, t || '_update', t);
    execute format($p$
      create policy %I on public.%I
        for delete to authenticated
        using (sahva.has_role(clinic_id, array['owner','manager']::public.staff_role[]))
    $p$, t || '_delete', t);
  end loop;

  -- admin_w: configuration is owner/manager only.
  foreach t in array admin_w loop
    execute format($p$
      create policy %I on public.%I
        for insert to authenticated
        with check (sahva.has_role(clinic_id, array['owner','manager']::public.staff_role[]))
    $p$, t || '_insert', t);
    execute format($p$
      create policy %I on public.%I
        for update to authenticated
        using      (sahva.has_role(clinic_id, array['owner','manager']::public.staff_role[]))
        with check (sahva.has_role(clinic_id, array['owner','manager']::public.staff_role[]))
    $p$, t || '_update', t);
    execute format($p$
      create policy %I on public.%I
        for delete to authenticated
        using (sahva.has_role(clinic_id, array['owner']::public.staff_role[]))
    $p$, t || '_delete', t);
  end loop;

  -- member_ro gets no write policy at all: the default deny stands.
end
$outer$;

-- ---------------------------------------------------------------------------
-- clinics — keyed on id, not clinic_id, so it needs its own policies.
-- ---------------------------------------------------------------------------
alter table public.clinics enable row level security;

create policy clinics_select on public.clinics
  for select to authenticated
  using (id in (select sahva.current_clinic_ids()));

create policy clinics_update on public.clinics
  for update to authenticated
  using      (sahva.has_role(id, array['owner','manager']::public.staff_role[]))
  with check (sahva.has_role(id, array['owner','manager']::public.staff_role[]));

-- No insert/delete policy: clinics are provisioned by service_role during
-- onboarding. A logged-in user cannot create or destroy a tenant.

-- ---------------------------------------------------------------------------
-- staff_profiles — a person sees themselves, plus colleagues they share a
-- clinic with (needed to render "assigned to" and "resolved by").
-- ---------------------------------------------------------------------------
alter table public.staff_profiles enable row level security;

create policy staff_profiles_select_self on public.staff_profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy staff_profiles_select_colleagues on public.staff_profiles
  for select to authenticated
  using (exists (
    select 1 from public.clinic_members m
    where m.staff_id = public.staff_profiles.id
      and m.clinic_id in (select sahva.current_clinic_ids())
  ));

create policy staff_profiles_update_self on public.staff_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- clinic_members — the RLS anchor itself. RLS is enabled but NOT forced, so
-- the SECURITY DEFINER helpers can still read it without recursion.
-- ---------------------------------------------------------------------------
alter table public.clinic_members enable row level security;

create policy clinic_members_select on public.clinic_members
  for select to authenticated
  using (
    staff_id = (select auth.uid())
    or clinic_id in (select sahva.current_clinic_ids())
  );

create policy clinic_members_insert on public.clinic_members
  for insert to authenticated
  with check (sahva.has_role(clinic_id, array['owner','manager']::public.staff_role[]));

create policy clinic_members_update on public.clinic_members
  for update to authenticated
  using      (sahva.has_role(clinic_id, array['owner','manager']::public.staff_role[]))
  with check (sahva.has_role(clinic_id, array['owner','manager']::public.staff_role[]));

create policy clinic_members_delete on public.clinic_members
  for delete to authenticated
  using (
    sahva.has_role(clinic_id, array['owner']::public.staff_role[])
    -- but never the last owner: enforced by clinic_members_single_owner_idx
    and role <> 'owner'
  );

-- ---------------------------------------------------------------------------
-- message_templates — clinic rows are tenant data; NULL clinic_id rows are
-- Sahva-provided defaults, readable by everyone, writable by no one.
-- ---------------------------------------------------------------------------
alter table public.message_templates enable row level security;

create policy message_templates_select on public.message_templates
  for select to authenticated
  using (clinic_id is null or clinic_id in (select sahva.current_clinic_ids()));

create policy message_templates_insert on public.message_templates
  for insert to authenticated
  with check (clinic_id is not null
              and sahva.has_role(clinic_id, array['owner','manager']::public.staff_role[]));

create policy message_templates_update on public.message_templates
  for update to authenticated
  using      (clinic_id is not null
              and sahva.has_role(clinic_id, array['owner','manager']::public.staff_role[]))
  with check (clinic_id is not null
              and sahva.has_role(clinic_id, array['owner','manager']::public.staff_role[]));

create policy message_templates_delete on public.message_templates
  for delete to authenticated
  using (clinic_id is not null
         and sahva.has_role(clinic_id, array['owner','manager']::public.staff_role[]));

-- ---------------------------------------------------------------------------
-- Child tables without their own clinic_id: reached through the parent.
-- ---------------------------------------------------------------------------
alter table public.prescription_items enable row level security;

create policy prescription_items_select on public.prescription_items
  for select to authenticated
  using (exists (
    select 1 from public.prescriptions p
    where p.id = prescription_id
      and p.clinic_id in (select sahva.current_clinic_ids())
  ));

create policy prescription_items_write on public.prescription_items
  for all to authenticated
  using (exists (
    select 1 from public.prescriptions p
    where p.id = prescription_id
      and p.clinic_id in (select sahva.current_clinic_ids())
  ))
  with check (exists (
    select 1 from public.prescriptions p
    where p.id = prescription_id
      and p.clinic_id in (select sahva.current_clinic_ids())
  ));

alter table public.patient_invoice_items enable row level security;

create policy patient_invoice_items_select on public.patient_invoice_items
  for select to authenticated
  using (exists (
    select 1 from public.patient_invoices i
    where i.id = invoice_id
      and i.clinic_id in (select sahva.current_clinic_ids())
  ));

create policy patient_invoice_items_write on public.patient_invoice_items
  for all to authenticated
  using (exists (
    select 1 from public.patient_invoices i
    where i.id = invoice_id
      and i.clinic_id in (select sahva.current_clinic_ids())
  ))
  with check (exists (
    select 1 from public.patient_invoices i
    where i.id = invoice_id
      and i.clinic_id in (select sahva.current_clinic_ids())
  ));

-- ---------------------------------------------------------------------------
-- Global reference data: readable by every authenticated user, written only
-- by service_role.
-- ---------------------------------------------------------------------------
alter table public.plans             enable row level security;
alter table public.vaccine_catalogue enable row level security;

create policy plans_select on public.plans
  for select to authenticated using (true);

create policy vaccine_catalogue_select on public.vaccine_catalogue
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Grants. RLS narrows rows; grants decide which verbs exist at all.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
