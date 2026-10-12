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
