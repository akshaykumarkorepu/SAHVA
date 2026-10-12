# SAHVA Admin — plan

A separate console for the people who run SAHVA (not the clinics): approve
clinics, watch payments and handle every way they go wrong, and see how the
business and each clinic are doing.

Written against the code as it stands: there is no platform-admin concept yet
(every role is clinic-scoped), clinics can currently sign up and start a trial
with no review, and payments land in `subscription_payments` via
`activate_paid_subscription()`.

---

## 1 · Principles

1. **A different front door.** Own sign-in at `/admin/signin`, own layout, never
   linked from the landing page or the clinic app, `noindex`. In production it
   is served only on its own host (e.g. `admin.sahva.in`); the clinic host
   returns 404 for `/admin`. Same design tokens and components, so it looks like
   SAHVA, but it is not reachable by wandering.
2. **Admin is not a clinic role.** A separate `platform_admins` table, not a
   row in `clinic_members`. An admin account cannot be a clinic member and vice
   versa — one login never carries both powers.
3. **Stronger sign-in than clinics.** Email + password + mandatory TOTP
   (Supabase MFA). Every admin API call requires the session to be at MFA
   level `aal2`. Short sessions (12 h), and sign-out everywhere on role change.
4. **Everything an admin does is recorded.** Append-only `admin_audit_log`:
   who, what, which clinic, why (a reason is required for anything that
   changes money or access), before/after.
5. **Admins see the business, not the patients.** SAHVA is the clinics' data
   processor; patients trusted their clinic, not us. Admin analytics for
   patients are **counts and rates per clinic**, never names, phones or
   clinical data. If support truly needs a record, see §7 (break-glass).
6. **The browser never holds the service key.** Admin pages call
   `/api/admin/*`; the API checks `platform_admins` + `aal2`, then reads with
   the service role and returns only what the page needs.

---

## 2 · Clinic verification (changes signup)

### What a clinic submits

Owners apply; staff never create clinics — they are invited by an approved
owner, as today.

| Field | Why | Verifiable how |
|---|---|---|
| Clinic name, address, city, PIN, clinic phone | identity, contact | phone OTP at signup |
| **ABDM Health Facility Registry (HFR) ID** | national unique facility ID | ABDM HFR lookup (needs ABDM integrator onboarding — see §9) |
| or **State clinical-establishment registration no.** + state | fallback: many small clinics have no HFR ID yet | certificate upload, checked by hand |
| **Owner doctor's medical registration no.** + council (NMC / Telangana State Medical Council) | a real practitioner stands behind it | NMC Indian Medical Register search, by hand at first |
| Registration certificate (PDF/photo) | evidence | private storage bucket, viewable by admins only |
| GSTIN (optional) | GST invoices for B2B | GST portal lookup |
| Owner's name, mobile, email | contact | email confirmation + mobile OTP |

Validation in the form: format checks only (PIN, GSTIN pattern, phone). Truth
is checked by the admin.

### States

```
draft → submitted → under_review → approved
                         │   ↘ needs_info → submitted (resubmit)
                         ↘ rejected
approved → suspended → approved (reinstate)
```

- **Submitted / under review:** the owner can sign in and set up doctors, hours
  and FAQs, but nothing faces patients: no AI answering, no portal links, no
  bookings by patients, no payments. A banner says "Under review — usually
  within 1 working day".
- **Approved:** the **trial starts at approval**, not at signup (today it
  starts at signup — that changes). Owner and invited staff get full access.
- **Needs info:** the admin's message is shown to the owner, who edits and
  resubmits. Clock on SLA pauses.
- **Rejected:** reason shown; data kept 30 days then deleted; same HFR /
  registration number cannot re-apply without admin unlock.
- **Suspended:** clinic locked (read-only for owner, nothing patient-facing);
  reason required; reinstate restores.

### Duplicate and fraud checks shown to the reviewer

- HFR ID / registration no. / clinic phone / GSTIN already used by another
  clinic → hard block, shown with a link to that clinic.
- Same owner email or device applying repeatedly.
- Name/address mismatch between certificate and form (reviewer ticks a
  checklist; recorded in the audit log).

### Data model

- `clinics`: add `verification_status`, `hfr_id` (unique), `establishment_reg_no`
  + `registration_state` (unique pair), `owner_reg_no` + `council`, `gstin`
  (unique), `submitted_at`, `reviewed_at`, `reviewed_by`, `review_note`.
- `clinic_documents` (clinic_id, kind, storage path, uploaded_at) in a private
  bucket; signed URLs issued per admin view, audited.
- `create_clinic_with_trial()` becomes `submit_clinic_application()` (no
  trial); new `approve_clinic()` / `reject_clinic()` / `request_clinic_info()`
  / `suspend_clinic()` — service-role only, each writing `admin_audit_log`.
- Enforcement in the database, like the rest of SAHVA: patient-facing RPCs
  (`book_appointment` from portal/AI, portal token issue, billing orders)
  refuse unless `verification_status = 'approved'`.

---

## 3 · Payments — the edge cases the admin owns

Every case below gets (a) automatic detection, (b) a row in a **Payment
exceptions** queue, (c) a clear admin action, (d) an audit entry.

| # | What happens | Detection | Admin action |
|---|---|---|---|
| 1 | Clinic paid but closed the tab before verify | webhook activates it; if webhook also missed, nightly **reconciliation** with Razorpay's Payments API finds a captured payment whose order is still `created` | "Activate" (runs the same idempotent function) |
| 2 | Paid twice for the same period | two `paid` rows for one subscription within N minutes, or overlapping periods | Refund the duplicate (Razorpay Refunds API), period untouched |
| 3 | Payment **authorized but not captured** | `payment.authorized` without `captured`; reconciliation | Capture or let auto-void; check auto-capture is on in Razorpay |
| 4 | Order created, never paid | `created` older than 24 h | Auto-expire; no action unless the clinic writes in |
| 5 | Amount paid ≠ plan price (tampering, price change mid-checkout) | compare captured amount to order + plan | Hold, don't activate; refund or accept with reason |
| 6 | Signature verification fails | logged on `/billing/verify` | Investigate; spike → security alert |
| 7 | Webhook for unknown order / replayed / out of order | stored, ignored, idempotent | None; visible for audit |
| 8 | Refund request (policy: full within 7 days; yearly pro-rata) | from support | Calculator shows policy amount; admin approves; Razorpay refund; subscription end adjusted |
| 9 | **Dispute / chargeback** (`payment.dispute.*`) | webhook | Flag clinic; upload evidence in Razorpay; optional suspend |
| 10 | Refund failed / pending at bank | `refund.failed`, `refund.processed` | Retry or pay out manually; note |
| 11 | Clinic suspended or rejected while holding a paid period | on state change | Prompt: refund unused period? |
| 12 | Trial ended, not paid / paid period lapsed | daily job | Grace period (configurable, e.g. 3 days), then restricted mode; admin can extend with reason |
| 13 | Price change | admin edits plan | Applies to next payment only; existing paid periods untouched |
| 14 | Test vs live mix-up | key prefix check (exists), mode stored on each payment | Refuse mixed records |
| 15 | GST invoice needed | clinic has GSTIN | Generate tax invoice PDF with sequential number (legal requirement once GST-registered) |

Tables: `payment_events` (every Razorpay webhook, raw, signature result —
append-only), `refunds`, `payment_exceptions` (type, status, assignee,
resolution). Webhook events to subscribe: `payment.captured`,
`payment.authorized`, `payment.failed`, `refund.processed`, `refund.failed`,
`payment.dispute.created/won/lost`.

---

## 4 · Analytics

All computed server-side; filters for date range, city, status.

### Business (top of Overview)
- Clinics by stage: applied → approved → trialing → paying → lapsed → churned
  (a funnel, with conversion % between stages).
- **MRR** (monthly + yearly ÷ 12), ARR, new vs churned MRR, net revenue
  this month, refunds, collections.
- Trial → paid conversion, time to first payment, monthly vs yearly mix.
- Approval queue size and median time to review.
- Payment success rate, open exceptions.

### Per clinic
- Profile, verification status and documents, owner and staff (names and
  roles only), subscription and full payment history.
- Usage: appointments (by source: AI / staff / walk-in / portal), calls handled
  and escalated, Action Required backlog, last staff sign-in.
- **Health score** from usage trend, trial days left, backlog, failed
  payments — "at risk" list for outreach.
- Unit economics from `usage_events`: cost to serve vs revenue → margin.

### Patients (aggregates only)
Per clinic and platform-wide: patients total / new this month, returning
rate, appointments per patient, no-show rate, portal-link adoption, Telugu vs
English share. No individual patient is identifiable here.

---

## 5 · Pages

```
/admin/signin                 email + password, then TOTP
/admin                        Overview: KPIs, funnel, revenue chart, queues
/admin/applications           verification queue (oldest first, SLA timer)
/admin/applications/[id]      form data, documents, duplicate checks, checklist,
                              Approve / Need info / Reject (reason required)
/admin/clinics                all clinics: search, filter by status/plan/city/health
/admin/clinics/[id]           profile · verification · subscription · payments ·
                              usage · staff · notes · actions (extend trial,
                              suspend, refund, comp days) — each needs a reason
/admin/payments               every transaction; filters; export CSV
/admin/payments/exceptions    the §3 queue
/admin/refunds                requests, approvals, status
/admin/analytics              revenue, conversion, usage, patient aggregates
/admin/audit                  admin_audit_log, filterable, read-only
/admin/team                   platform admins and roles (super admin only)
/admin/settings               plan prices, trial length, grace period
```

### Admin roles
| Role | Can |
|---|---|
| Super admin | everything, manage admins and pricing |
| Reviewer | approve / reject / request info on applications |
| Finance | payments, refunds, exceptions, invoices |
| Support | read clinics and usage, add notes; no money, no approvals |
| Analyst | analytics only |

Refunds above a threshold need a second admin's approval.

---

## 6 · Notifications

- Owner: application received / needs info / approved / rejected; trial
  ending (3 days, 1 day); payment received; payment failed; refund processed.
  Email first (Supabase/Resend); WhatsApp once the integration exists.
- Admins: new application, exception raised, dispute, SLA breach (daily digest
  + immediate for disputes and signature-failure spikes).

---

## 7 · Break-glass (only if needed)

If support must look at a specific patient record to fix a problem: the
clinic owner grants time-limited access from their Settings, or a super admin
opens it with a written reason. Either way it is logged in the clinic's own
`record_access_log`, so the owner sees that SAHVA staff looked. No silent
impersonation.

---

## 8 · Build order

| Phase | What | Why first |
|---|---|---|
| A | `platform_admins`, MFA sign-in, admin host guard, `admin_audit_log`, `/api/admin` gate | nothing else is safe without it |
| B | Verification: new signup form + documents, states, approve/reject, DB gating, trial-at-approval | changes the signup that exists today |
| C | Clinics list + detail, subscription actions (extend, suspend) | day-to-day operations |
| D | Payment ledger, webhook event store, reconciliation job, exceptions queue, refunds | money correctness |
| E | Analytics (business, per clinic, patient aggregates), health score | needs A–D's data |
| F | Notifications, GST invoices, two-person refunds, break-glass | hardening |

Each phase ships with DB tests (RLS: a clinic user can never reach admin
data; an admin can never act without an audit row) and smoke tests, like the
rest of the repo.

---

## 9 · Decisions needed

1. **Which ID is mandatory?** HFR ID only, or HFR *or* state registration
   (recommended — many small clinics lack an HFR ID)? Is the owner doctor's
   council registration required?
2. **Automatic verification via ABDM** needs SAHVA to register as an ABDM
   integrator (sandbox first). Until then verification is manual. Worth
   starting the ABDM application now?
3. **What can a pending clinic do?** Recommended: set up, but nothing
   patient-facing and no payments.
4. **Trial starts at approval** (recommended) or at signup?
5. **After trial/lapse:** grace days, then read-only? Or keep working with a
   warning?
6. **Admin host:** a subdomain (recommended) or a path on the same host?
7. **Patient data in admin:** aggregates only (recommended), with break-glass?
8. **Refund policy and approval threshold** for two-person sign-off.

### Decided (2026-10-12)

1. **ID:** HFR ID *or* state clinical-establishment registration, plus the
   owner doctor's medical council registration.
2. **Pending clinics:** may set up doctors, hours and FAQs; nothing
   patient-facing and no payments until approved.
3. **Expiry:** 3-day grace with a warning, then read-only (data visible,
   nothing patient-facing) until paid.
4. **Host:** admin console on its own subdomain; `/admin` returns 404 on the
   clinic domain.

Still open: ABDM integrator registration (automatic HFR checks), refund
two-person threshold, break-glass on or off.

---

## Status

**Step 1 done (2026-10-12):** platform admins (migration `000800`), the
2FA-gated `/api/admin`, the append-only admin audit log, the admin-only host,
`/admin/signin` (password + authenticator code, set up on first sign-in), and
a console with Overview and Audit log.

### Making the first admin

1. Supabase → Authentication → **Add user**: email + password.
2. Supabase → SQL editor:
   `select sahva.grant_platform_admin('you@example.com', 'super_admin', 'Your Name');`
3. Open `/admin/signin` (locally `http://localhost:3000/admin/signin`), sign
   in, scan the QR with an authenticator app, enter the code.

MFA (TOTP) must be enabled in Supabase → Authentication → Multi-factor (it is
on by default for new projects).

### Production

- `ADMIN_HOST=admin.<your-domain>` on the web app, and point that subdomain
  at the same deployment.
- Add `https://admin.<your-domain>` to the API's `CORS_ORIGINS`.

Next: step 2, clinic verification.
