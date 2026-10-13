# Security model

## Threat being defended against

A clinic owner in Warangal must never see a row belonging to a clinic in
Karimnagar — not through the API, not through a crafted PostgREST filter, not
through a view, and not through a bug in the voice agent.

Patient data here is medical: appointment history, conditions, prescriptions,
vaccination records. A cross-tenant leak is not an embarrassment, it is a
breach.

## Layers

**1. Row Level Security.** Enabled on all 37 tables; 0 tables are uncovered.
Every policy resolves through one function:

```sql
sahva.current_clinic_ids()  -- clinics where auth.uid() is an active member
```

Change the membership rule there and every policy follows. `auth.uid()` is
wrapped in `(select auth.uid())` so the planner caches it once per query rather
than evaluating per row.

**2. Composite foreign keys.** RLS filters rows a *user* can see. It does not
stop `service_role` — which the telephony webhook must use, since an inbound
call carries no user JWT — from writing a row that mixes tenants. Composite FKs
on `(id, clinic_id)` make that a `foreign_key_violation` at the storage layer,
below RLS and below the application.

**3. SECURITY DEFINER write paths.** `book_appointment()`,
`cancel_appointment()` and `reschedule_appointment()` call
`sahva.assert_clinic_access()` first, so a logged-in receptionist cannot act on
another clinic even through an RPC.

## Access classes

| Class | Read | Write | Tables |
|---|---|---|---|
| `member_rw` | any active member | any active member | patients, appointments, calls, action items, batches, messages, consultations, invoices, time off |
| `admin_w` | any active member | owner/manager only | clinic settings, hours, closures, doctors, sessions, services, FAQs, care plans, subscriptions |
| `member_ro` | any active member | **nobody** | appointment_events, call_turns, call_tool_invocations, usage_events, subscription_invoices |

`member_ro` tables have no write policy at all — the default deny stands. They
are written only by SECURITY DEFINER functions and `service_role`.

Deletes are narrower than updates everywhere: `member_rw` deletes need
owner/manager, `admin_w` deletes need owner.

## Deliberate choices

**`anon` is revoked outright.** Nothing in this product is public. The role is
stripped of table, function and sequence privileges, and the default privileges
are altered so future tables do not silently grant it back.

**FORCE ROW LEVEL SECURITY is not set anywhere.** It would break two things:
the SECURITY DEFINER predicate helpers, which must read `clinic_members`
without recursing into that table's own policy; and the `service_role` bypass
the telephony webhook depends on. This is a real trade-off — a compromised
`service_role` key reads everything — and it is why the composite FK layer
exists underneath.

**All views are `security_invoker = true`.** A view without it executes as its
owner, which in Supabase means it bypasses the caller's RLS and returns every
tenant's rows. This is the single most common way a correctly-secured Supabase
schema leaks, and it is why `v_open_action_items` and friends are explicitly
tested from a logged-in session rather than as superuser.

**All SECURITY DEFINER functions set `search_path = ''`** and fully qualify
every identifier, so a caller cannot shadow a table or function name and
redirect the definer's privileges.

**`ai_may_cancel` defaults to false.** A wrongly cancelled medical appointment
is the worst failure mode this system has. `cancel_appointment()` raises
`insufficient_privilege` when `actor = 'ai'` and the clinic has not opted in;
the AI raises an escalation for staff instead.

## Key handling

| Key | Where | RLS |
|---|---|---|
| `anon` | nowhere — revoked | n/a |
| `authenticated` (user JWT) | staff dashboard | enforced |
| `service_role` | server-side only: telephony webhook, message workers, billing jobs | **bypassed** |

The `service_role` key must never reach the browser. Every dashboard read goes
through a user JWT.

## What the tests prove

`supabase/tests/21_rls_isolation.sql` runs as three real users against two real
clinics and asserts, among others:

- an owner sees exactly one clinic, and zero rows of the other's patients,
  appointments, calls or FAQs
- a cross-tenant `INSERT` is rejected by `WITH CHECK` even when the attacker
  holds the foreign `clinic_id`
- views inherit RLS and do not leak
- a receptionist can add a patient but cannot change fees or AI permissions
- nobody, at any role, can hand-write the audit log
- `anon` cannot read patient data

Later suites add:

- `23_appointment_status` — front-desk status changes land in the audit log
  naming the staff member, and cannot be made across clinics
- `24_batch_progress` — no patient contact is recorded before a reschedule is
  approved, and an appointment cannot be rebooked twice
- `26_record_access_log` — every read of a medical record or patient profile
  is logged with who read it; a patient cannot log or read anyone else's; staff
  of another clinic are refused; only owners and managers can see the log; it
  cannot be written directly, updated or deleted

## Reads are audited

`GET /me/medical` and `GET /patients/:id` call `log_record_access()` before
returning anything. The function derives the reader from the session — staff
of that patient's clinic, or the patient's own account — so the API cannot
record a read against someone else. If the log write fails, the read is
refused (503): an unaudited read of health data is worse than a retry. Owners
and managers see the last reads in the patient quick view.

Portal links do not reach clinical tables at all (`test/portal-scope.test.ts`),
so they are not in this log; their use is counted on `patient_access_tokens`.

## SAHVA support and patient records (break-glass)

Platform admins see counts, never patients. The one exception is opened by
the clinic, not by us: the owner grants support access from Settings for
1–72 hours with a reason, and can close it at any time
(`grant_support_access` checks the owner role from the session). While it is
open, admins with the support or super-admin role can search that clinic's
patients and open a profile and appointment list — not medical records.
`admin_log_support_access` refuses without an open grant and writes, before
anything is served, an `admin_audit_log` row (with the clinic's reason) and,
for each patient opened, a `record_access_log` row with actor `support`, which
the owner sees in that patient's access log. Tested in
`supabase/tests/34_refund_approvals_and_support.sql`.

## Money controls

Refunds above `platform_settings.refund_second_approval_paise` need two
finance admins (asker ≠ approver), enforced in `admin_record_refund`; a claim
step makes concurrent approvals refund once. Invoices and credit notes are
immutable and numbered without gaps per financial year.

## Call transcripts

Patients describe symptoms when they call, so transcripts are treated like
clinical records (migration `001800`, DB suite 35):

- **Retention.** Each clinic keeps transcripts 30–365 days (default 90). The
  scheduled job deletes the words — turns, tool arguments, summaries, the
  recording link — and keeps the call row (time, outcome, booking link) so
  analytics still add up. `call_turns` stays append-only; only the purge
  function can delete, behind a transaction-local flag.
- **Who reads them.** Owners, managers and doctors; receptionists only if the
  owner allows it (Settings → Privacy & support). Enforced by RLS on
  `call_turns`, `call_tool_invocations` and `call_summaries`.
- **Audited.** `GET /calls/:id` calls `log_call_access` first and fails
  closed. Each opening is in `call_access_log`, and in the patient's own
  access log when the call is linked to a patient.

## Security events

`security_events` (append-only, admin-only) records refused requests — 401,
403 and 429 on the API, classed as failed sign-in, access denied, admin
access refused, invalid patient link or rate limited — and every staff
member added, removed or changed role (a database trigger, so no code path
can skip it). Rows hold address, method and path only; patient-link paths
are stored as `/api/portal/:token`, never the token. Writes are throttled to
one per address and kind every 5 seconds. 20+ refused requests from one
address in 15 minutes emails super admins; the daily digest carries 24-hour
counts. Admin → Security shows counts, the most-refused addresses, and the
latest events.

## DPDP Act 2023 — applicability review (2026-10)

Not legal advice: a map of where SAHVA stands, to be checked with counsel
before clinics sign. The DPDP Rules were notified in November 2025 with most
obligations phased in over 18 months; confirm the dates that apply.

**Roles.** For patient data, each **clinic is the Data Fiduciary** and SAHVA
is its **Data Processor** — SAHVA processes patients' data only to run the
clinic's reception, on the clinic's instructions. For clinic staff accounts,
billing and the admin console, **SAHVA is the Data Fiduciary**.

**What is in place**

| Obligation | Where |
|---|---|
| Reasonable security safeguards | RLS on every table, service key never in the browser, admin 2FA, append-only audit and access logs, fail-closed read auditing |
| Purpose limitation / minimisation | Admins see counts, not patients; notifications carry no patient data; support access only when the clinic grants it, profiles and appointments only |
| Erasure when no longer needed | Transcript retention with automatic deletion |
| Logs to detect and investigate misuse | `record_access_log`, `call_access_log`, `admin_audit_log`, `security_events` — none are purged (the Rules expect logs kept at least a year; confirm) |
| Processor acts on fiduciary's instructions | Clinic-controlled settings: transcript retention and visibility, support access grants |
| Data stays in India by default | Database in ap-south-1 (Mumbai) |

**Gaps to close before patients' data is processed at scale**

1. **Data Processing Agreement** with every clinic (processor terms, security,
   breach notice to the clinic, sub-processors, deletion at contract end).
   The terms page is not enough.
2. **Notice to patients on calls and WhatsApp.** The AI's greeting must say
   the call is answered by an automated assistant and transcribed, and point
   to the clinic's privacy notice. Confirm in the voice script.
3. **Data principal requests.** The clinic must be able to give a patient
   their data, correct it, and erase it. There is no export or erase tool for
   a single patient yet.
4. **Breach response runbook.** Who decides, how the clinic is told, and the
   timeline for informing the Data Protection Board and affected patients
   (the Rules set 72 hours for the Board's detailed report — confirm).
5. **Sub-processor list**, published: Supabase, Render, Vercel, Anthropic
   (transcripts are sent to the model — outside India), Razorpay, Resend,
   and the telephony and WhatsApp providers once chosen.
6. **Children's data.** Paediatric clinics will hold children's records. The
   Rules exempt clinical establishments and healthcare professionals from
   verifiable parental consent to the extent needed to provide health
   services — confirm SAHVA's processing on their behalf falls within it.
7. **Account data for staff** (SAHVA as fiduciary): a privacy notice that
   covers staff accounts, and a grievance contact.

## Not yet addressed

- **Audit of patient-profile reads beyond `GET /patients/:id`.** Clinical
  tables are guarded (`test/clinical-reads-audited.test.ts` fails if a handler
  reads one without `recordAccess`); contact details read elsewhere — lists,
  search — are not logged.
- **Encryption at rest beyond Supabase defaults.** No column-level encryption
  on phone numbers or clinical notes.
- **Rate limiting.** Nothing here stops a compromised account enumerating its
  own clinic's patients quickly. That belongs at the API edge.
- **`service_role` key rotation.** Operational, not schema.
- **DPDP Act compliance** (consent, retention, erasure) has not been reviewed.
