-- ============================================================================
-- SAHVA · Invoices and credit notes for clinic subscriptions
--
-- platform_settings  SAHVA's own business details (the seller on every
--                    invoice) and the refund amount that needs two admins.
-- invoices           one invoice per paid payment and one credit note per
--                    processed refund, numbered without gaps per financial
--                    year (INV/26-27/00001, CN/26-27/00001), immutable.
--
-- Prices are what the clinic pays. When SAHVA has a GSTIN the price is
-- treated as GST-inclusive and the invoice is a tax invoice showing CGST +
-- SGST (same state as the clinic) or IGST (another state); without one it is
-- a bill of supply with no tax. Each document snapshots both parties, so a
-- later change of address never rewrites an issued invoice.
--
-- Nothing is issued until the seller's details are filled in (is_ready):
-- an invoice naming a placeholder business cannot be taken back.
-- issue_missing_invoices() catches up afterwards.
-- ============================================================================

create table public.platform_settings (
  id                         boolean primary key default true check (id),
  legal_name                 text not null default '',
  address                    text not null default '',
  state                      text not null default 'Telangana',
  state_code                 text not null default '36' check (state_code ~ '^[0-9]{2}$'),
  gstin                      text check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  pan                        text check (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  email                      text not null default '',
  phone                      text not null default '',
  -- 997331: licensing services for the right to use software (SaaS). Confirm with your CA.
  sac_code                   text not null default '997331' check (sac_code ~ '^[0-9]{6}$'),
  gst_rate_bps               integer not null default 1800 check (gst_rate_bps between 0 and 2800),
  -- Refunds above this need a second admin's approval. ₹2,000: a monthly
  -- payment can be refunded by one admin, a yearly one needs two.
  refund_second_approval_paise integer not null default 200000 check (refund_second_approval_paise >= 0),
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references public.platform_admins(user_id) on delete set null,
  check (gstin is null or substr(gstin, 1, 2) = state_code)
);
insert into public.platform_settings default values;
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from authenticated, anon;

/** Invoices may be issued: the seller is a real, named business. */
create or replace function sahva.invoicing_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select length(btrim(legal_name)) >= 3 and length(btrim(address)) >= 10 from public.platform_settings;
$$;

create table public.invoice_counters (
  series text not null check (series in ('INV', 'CN')),
  fy     text not null check (fy ~ '^[0-9]{2}-[0-9]{2}$'),
  last   integer not null default 0,
  primary key (series, fy)
);
alter table public.invoice_counters enable row level security;
revoke all on public.invoice_counters from authenticated, anon;

create table public.invoices (
  id                  uuid primary key default extensions.gen_random_uuid(),
  kind                text not null check (kind in ('invoice', 'credit_note')),
  number              text not null unique check (length(number) <= 16),
  fy                  text not null,
  clinic_id           uuid not null references public.clinics(id) on delete restrict,
  payment_id          uuid not null references public.subscription_payments(id) on delete restrict,
  refund_id           uuid unique references public.refunds(id) on delete restrict,
  original_invoice_id uuid references public.invoices(id),
  issued_at           timestamptz not null default now(),
  seller              jsonb not null,
  buyer               jsonb not null,
  description         text not null,
  sac_code            text not null,
  period_start        timestamptz,
  period_end          timestamptz,
  is_tax_invoice      boolean not null,
  gst_rate_bps        integer not null,
  taxable_paise       integer not null check (taxable_paise >= 0),
  cgst_paise          integer not null default 0,
  sgst_paise          integer not null default 0,
  igst_paise          integer not null default 0,
  total_paise         integer not null check (total_paise > 0),
  check (taxable_paise + cgst_paise + sgst_paise + igst_paise = total_paise),
  check ((kind = 'invoice') = (refund_id is null and original_invoice_id is null))
);
create unique index invoices_one_per_payment on public.invoices (payment_id) where kind = 'invoice';
create index invoices_clinic_idx on public.invoices (clinic_id, issued_at desc);
alter table public.invoices enable row level security;
create policy invoices_select on public.invoices
  for select to authenticated
  using (sahva.has_role(clinic_id, array['owner', 'manager']::public.staff_role[]));
revoke insert, update, delete on public.invoices from authenticated, anon;
create trigger invoices_immutable before update or delete on public.invoices
  for each row execute function sahva.reject_log_change();

/** Indian financial year of an instant, e.g. '26-27' for 12 Oct 2026. */
create or replace function sahva.financial_year(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(y, 'FM00') || '-' || to_char(y + 1, 'FM00')
    from (select (extract(year from (p_at at time zone 'Asia/Kolkata'))::int
                  - case when extract(month from (p_at at time zone 'Asia/Kolkata')) < 4 then 1 else 0 end) % 100 as y) t;
$$;

create or replace function sahva.next_document_number(p_series text, p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_fy text := sahva.financial_year(p_at); v_n int;
begin
  insert into public.invoice_counters (series, fy, last) values (p_series, v_fy, 1)
  on conflict (series, fy) do update set last = public.invoice_counters.last + 1
  returning last into v_n;
  return p_series || '/' || v_fy || '/' || to_char(v_n, 'FM00000');
end;
$$;

/** Issue the invoice for a paid payment. Idempotent; null when not ready. */
create or replace function sahva.issue_invoice(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay   public.subscription_payments;
  v_c     public.clinics;
  v_s     public.platform_settings;
  v_id    uuid;
  v_total int;
  v_tax   int := 0;
  v_intra boolean;
  v_buyer_code text;
begin
  select id into v_id from public.invoices where payment_id = p_payment_id and kind = 'invoice';
  if v_id is not null or not sahva.invoicing_ready() then
    return v_id;
  end if;
  select * into v_pay from public.subscription_payments where id = p_payment_id;
  if v_pay.status <> 'paid' then
    return null;
  end if;
  select * into v_c from public.clinics where id = v_pay.clinic_id;
  select * into v_s from public.platform_settings;

  v_total := coalesce(v_pay.captured_paise, v_pay.amount_paise);
  v_buyer_code := coalesce(substr(v_c.gstin, 1, 2),
                           case when v_c.state is null or lower(btrim(v_c.state)) = lower(v_s.state) then v_s.state_code end);
  v_intra := v_buyer_code = v_s.state_code;
  if v_s.gstin is not null then
    v_tax := v_total - round(v_total * 10000.0 / (10000 + v_s.gst_rate_bps))::int;
  end if;

  insert into public.invoices (kind, number, fy, clinic_id, payment_id, issued_at, seller, buyer, description, sac_code,
                               period_start, period_end, is_tax_invoice, gst_rate_bps, taxable_paise,
                               cgst_paise, sgst_paise, igst_paise, total_paise)
  -- Dated when issued, never backdated: a catch-up after the seller's details
  -- are filled in issues today's invoice for an earlier payment.
  values ('invoice', sahva.next_document_number('INV', now()), sahva.financial_year(now()),
          v_c.id, v_pay.id, now(),
          jsonb_build_object('legal_name', v_s.legal_name, 'address', v_s.address, 'state', v_s.state,
                             'state_code', v_s.state_code, 'gstin', v_s.gstin, 'pan', v_s.pan,
                             'email', v_s.email, 'phone', v_s.phone),
          jsonb_build_object('name', coalesce(v_c.legal_name, v_c.name), 'address', concat_ws(', ', v_c.address_line, v_c.city,
                             v_c.district, v_c.state, v_c.pincode), 'state', coalesce(v_c.state, v_s.state),
                             'state_code', v_buyer_code, 'gstin', v_c.gstin),
          'SAHVA for Clinics — ' || case v_pay.billing_cycle when 'yearly' then '1 year' else '1 month' end || ' subscription',
          v_s.sac_code, v_pay.period_start, v_pay.period_end,
          v_s.gstin is not null, case when v_s.gstin is not null then v_s.gst_rate_bps else 0 end,
          v_total - v_tax,
          case when v_intra then v_tax / 2 else 0 end,
          case when v_intra then v_tax - v_tax / 2 else 0 end,
          case when v_intra then 0 else v_tax end,
          v_total)
  returning id into v_id;
  return v_id;
end;
$$;

/** Issue the credit note for a processed refund, tax split like its invoice. */
create or replace function sahva.issue_credit_note(p_refund_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r   public.refunds;
  v_inv public.invoices;
  v_id  uuid;
  v_amt int;
  v_tax int;
begin
  select id into v_id from public.invoices where refund_id = p_refund_id;
  if v_id is not null or not sahva.invoicing_ready() then
    return v_id;
  end if;
  select * into v_r from public.refunds where id = p_refund_id;
  if v_r.status <> 'processed' then
    return null;
  end if;
  perform sahva.issue_invoice(v_r.payment_id);
  select * into v_inv from public.invoices where payment_id = v_r.payment_id and kind = 'invoice';
  if v_inv.id is null then
    return null;
  end if;

  v_amt := v_r.amount_paise;
  v_tax := round(v_amt::numeric * (v_inv.cgst_paise + v_inv.sgst_paise + v_inv.igst_paise) / v_inv.total_paise)::int;
  insert into public.invoices (kind, number, fy, clinic_id, payment_id, refund_id, original_invoice_id, issued_at, seller, buyer,
                               description, sac_code, period_start, period_end, is_tax_invoice, gst_rate_bps,
                               taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise)
  values ('credit_note', sahva.next_document_number('CN', now()), sahva.financial_year(now()),
          v_inv.clinic_id, v_inv.payment_id, v_r.id, v_inv.id, now(), v_inv.seller, v_inv.buyer,
          'Refund against ' || v_inv.number || ' — ' || v_r.reason, v_inv.sac_code, v_inv.period_start, v_inv.period_end,
          v_inv.is_tax_invoice, v_inv.gst_rate_bps,
          v_amt - v_tax,
          case when v_inv.igst_paise = 0 then v_tax / 2 else 0 end,
          case when v_inv.igst_paise = 0 then v_tax - v_tax / 2 else 0 end,
          case when v_inv.igst_paise = 0 then 0 else v_tax end,
          v_amt)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function sahva.issue_invoice(uuid) from public, anon, authenticated;
revoke all on function sahva.issue_credit_note(uuid) from public, anon, authenticated;
revoke all on function sahva.next_document_number(text, timestamptz) from public, anon, authenticated;

create or replace function sahva.invoice_on_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'paid' and old.status <> 'paid' then
    perform sahva.issue_invoice(new.id);
  end if;
  return null;
end;
$$;
create trigger subscription_payments_invoice
  after update of status on public.subscription_payments
  for each row execute function sahva.invoice_on_paid();

create or replace function sahva.credit_note_on_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'processed' and (tg_op = 'INSERT' or old.status <> 'processed') then
    perform sahva.issue_credit_note(new.id);
  end if;
  return null;
end;
$$;
create trigger refunds_credit_note
  after insert or update of status on public.refunds
  for each row execute function sahva.credit_note_on_refund();

/** Issue whatever is owed once invoicing is ready. Returns how many were issued. */
create or replace function public.issue_missing_invoices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_n int := 0;
begin
  if not sahva.invoicing_ready() then
    return 0;
  end if;
  for r in
    select p.id from public.subscription_payments p
     where p.status = 'paid' and not exists (select 1 from public.invoices i where i.payment_id = p.id and i.kind = 'invoice')
     order by p.paid_at
  loop
    perform sahva.issue_invoice(r.id); v_n := v_n + 1;
  end loop;
  for r in
    select f.id from public.refunds f
     where f.status = 'processed' and not exists (select 1 from public.invoices i where i.refund_id = f.id)
     order by f.processed_at
  loop
    perform sahva.issue_credit_note(r.id); v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

/** Super admins change SAHVA's business details and the refund threshold. Audited. */
create or replace function public.admin_update_platform_settings(p_changes jsonb, p_admin_id uuid, p_request_id text default null)
returns public.platform_settings
language plpgsql
security definer
set search_path = ''
as $$
declare v_before public.platform_settings; v_after public.platform_settings;
begin
  if not exists (select 1 from public.platform_admins where user_id = p_admin_id and role = 'super_admin' and disabled_at is null) then
    raise exception 'Only a super admin can change platform settings' using errcode = 'insufficient_privilege';
  end if;
  select * into v_before from public.platform_settings for update;
  update public.platform_settings set
    legal_name  = coalesce(btrim(p_changes->>'legal_name'), legal_name),
    address     = coalesce(btrim(p_changes->>'address'), address),
    state       = coalesce(btrim(p_changes->>'state'), state),
    state_code  = coalesce(p_changes->>'state_code', state_code),
    gstin       = case when p_changes ? 'gstin' then nullif(upper(btrim(p_changes->>'gstin')), '') else gstin end,
    pan         = case when p_changes ? 'pan' then nullif(upper(btrim(p_changes->>'pan')), '') else pan end,
    email       = coalesce(btrim(p_changes->>'email'), email),
    phone       = coalesce(btrim(p_changes->>'phone'), phone),
    sac_code    = coalesce(p_changes->>'sac_code', sac_code),
    gst_rate_bps = coalesce((p_changes->>'gst_rate_bps')::int, gst_rate_bps),
    refund_second_approval_paise = coalesce((p_changes->>'refund_second_approval_paise')::int, refund_second_approval_paise),
    updated_at = now(), updated_by = p_admin_id
  returning * into v_after;
  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, before, after, request_id)
  values (p_admin_id, 'platform.settings', 'platform_settings', 'singleton',
          to_jsonb(v_before) - 'updated_at' - 'updated_by', to_jsonb(v_after) - 'updated_at' - 'updated_by', p_request_id);
  perform public.issue_missing_invoices();
  return v_after;
end;
$$;

revoke all on function public.issue_missing_invoices() from public, anon, authenticated;
revoke all on function public.admin_update_platform_settings(jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.issue_missing_invoices() to service_role;
grant execute on function public.admin_update_platform_settings(jsonb, uuid, text) to service_role;
