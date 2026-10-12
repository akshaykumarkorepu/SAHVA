# Upgrade plan

What to build next, drawn from two external proposals (a "master implementation
prompt" and a longer product review) and checked against what this branch
actually contains. It extends [roadmap.md](roadmap.md) rather than replacing
it: the roadmap's first three sections are still the first week of work.

The test applied to every suggestion: **does it make SAHVA more dependable for
a clinic, or does it only make it look more capable?** The first kind is in.
The second kind is deferred or cut, with the reason written down.

---

## What the proposals got right, and what they got wrong

The product review is the better document. Its core argument — turn the
database's guarantees (exclusion-constraint booking, tenant isolation, the
trust flow that refuses to silently cancel) into things staff can *see* — is
the right one, and it shapes the order below.

The implementation prompt has useful items but several that would make the
product less honest:

| Suggestion | Verdict | Why |
|---|---|---|
| Remove dark mode, white surfaces, tinted shadows, sonner toasts | **Do** | Already roadmap §1. |
| Split the 1,203-line `me/page.tsx` | **Do** | Prerequisite for testing it. |
| `@tanstack/react-query` + Supabase Realtime | **Do** | Two staff seeing different states is a credibility bug. |
| Walk-in fast-pass, OPD token on portal, TV display | **Do** | `appointments.token_number` already exists; cheap and very Indian-clinic. |
| Read-audit of medical records | **Do, early** | `security.md` lists it under *Not yet addressed*. |
| Printable prescription | **Do, as print CSS** | A `/print/rx/[id]` page with `@media print`; no server PDF stack needed. |
| `Cmd+K` command palette | **Later** | Nice for power users; receptionists on Android phones won't press Cmd+K. |
| BullMQ + Redis workers | **Replace** | Postgres already holds the queue (`messages.status = 'queued'`). Poll with `FOR UPDATE SKIP LOCKED`, schedule with `pg_cron`. No new infrastructure. |
| Razorpay / UPI advance payment | **Defer** | Adds friction before a clinic has asked for it. A plain `upi://pay` link on an issued invoice is fine later. |
| Telugu audio soundboard on landing page | **Defer** | No STT/TTS vendor yet. Audio that the product can't actually produce is a false claim. |
| "Verified" Warangal/Karimnagar badges, doctor quotes | **Cut until real** | There are no pilot clinics yet. Fabricated testimonials are the fastest way to lose a doctor's trust. |
| "వినండి" audio prescription | **Defer** | Needs real Telugu TTS; browser `speechSynthesis` Telugu voices are unreliable on cheap Android. The visual dosage chart ships first. |
| ICD-10 suggestions on consultations | **Cut** | AI-suggested diagnosis codes are a clinical/regulatory question, not a UI task. |
| Live-call "Intervene / Take over" | **Defer** | Needs telephony. A read-only transcript viewer over `call_turns` can ship now. |

---

## Phase 0 · Talk to clinics — starts now, runs in parallel

Unchanged from roadmap §5 and still the most important line here. Eight to ten
owners in Warangal, Karimnagar and Nizamabad. Bring the product; ask what they
pay today for reception, how many calls they miss, and what they'd pay to stop
missing them. Every price, ROI number and testimonial on the landing page
waits for this.

**Exit:** written notes from ≥8 conversations; a decided price point.

---

## Phase 1 · Foundation — ~1 week

Roadmap §1–3, plus the refactor that unlocks everything after it.

1. **One theme, done properly** (roadmap §1)
   - Drop `darkMode: "class"`, the `.dark` token block, `ThemeProvider`,
     `ThemeToggle`, and the toggle in every file that imports it.
   - `--surface: 255 255 255`, `--surface-sunken: 248 250 252`, brand-tinted
     shadows. Check every text/background pair ≥ 4.5:1.
   - Mount `sonner` `<Toaster />` in `app/layout.tsx`; replace ad-hoc success
     and error banners.
2. **Stop finding bugs by hand** (roadmap §2)
   - ESLint with `eslint-config-next` and `react-hooks/exhaustive-deps`.
   - Playwright, four flows: staff sign-in → dashboard; patient sign-in →
     record; Action Required → review → dispatch; same slot booked twice →
     second fails with a readable message.
   - `error.tsx` and `not-found.tsx`.
3. **Finish the half-built** (roadmap §3) — role-gated UI verified as a
   receptionist, clinic-local times instead of raw UTC, Google OAuth configured
   or hidden, 429 shown as a lockout rather than a wrong password.
4. **Split `apps/web/app/me/page.tsx`** into `components/patient/`:
   `AppointmentHero`, `DosageVisualizer`, `CareTasksList`,
   `PrescriptionHistory`, `VaccinationTracker`, `InvoiceHistory`. Pure
   functions (`isActiveRx`, overdue maths) get unit tests as they move.

**Exit:** `npm run typecheck`, `npm run test:db`, `npm run test:api`,
`npm run build -w apps/web` and the four Playwright flows all green in CI.

**Status (2026-10-12): done, with one gap.** One white theme, toasts, ESLint,
error and 404 pages, clinic-local action times, lockout message, Google behind
a flag, the patient record split with 11 unit tests, and 42 Playwright smoke
tests (every screen, desktop and mobile, plus the receptionist's view) — all
in CI and green. The gap: the four *database-backed* flows (real sign-in,
double-booking, dispatch) need a seeded Supabase in CI, which does not exist
yet. Migration `20261012000100` is committed but not yet applied to the
hosted project.

---

## Phase 2 · Command Center and Trust Center — ~2 weeks

The two staff-facing signature experiences. Both sit on schema that already
exists.

### 2a · Real-time data layer (do first; the rest depends on it)

- Replace the custom `useApi` with `@tanstack/react-query`.
- Subscribe to Supabase Realtime on `appointments`, `action_items` and
  `messages`, **filtered by `clinic_id`** and relying on RLS — never a shared
  channel. Events invalidate queries; they are never the source of truth.
- Reconnect handling, refetch on window focus, dedupe repeated events.

### 2b · Dashboard as Command Center

Answer four questions in five seconds: *what's happening today, what needs me,
is SAHVA working, are we losing appointments.*

- Row 1: today's appointments · calls handled · bookings from calls · open
  actions.
- Row 2: today's timeline with a now-line; each row shows patient, doctor,
  status, **source** (`booking_source`: AI call / staff / walk-in / web) and
  confirmation state. Clicking opens a **side panel**, not a new page.
- Row 3: top 3–5 open action items by severity.
- Analytics stays on `/dashboard/analytics`; the home screen is operational.

### 2c · Action Center as Trust Center

Builds on `action_items`, `reschedule_batches` and `reschedule_batch_items`.

- Group by category: appointments · patient communication · AI quality ·
  system health.
- Each item: what happened, when, who's affected, why it couldn't auto-resolve,
  the suggested action.
- Doctor-unavailable flow, end to end: impact summary → original vs proposed
  slot side by side (slots from `get_available_slots`, never computed in the
  browser) → approve → dispatch → per-patient outcome.
- **Show message state exactly as stored.** `queued` is not `sent`; `sent` is
  not `delivered`. The UI must never round a state up. Keep the database's
  approval constraint the only path to dispatch.

### 2d · Appointments

- Day view (vertical timeline per doctor) and week view (load per day, gaps,
  leave). Doctor-comparison view later.
- Status shown with label + icon, never colour alone.
- Booking modal: doctor → date → slots from the DB → find-or-create patient →
  confirm. On an exclusion-constraint rejection: *"This slot was just taken —
  pick another"*, then refetch slots.
- Patient quick-view: contact, history, upcoming, no-shows, messages; clinical
  fields only for roles allowed to see them.

**Exit:** two browsers signed into the same clinic see a booking appear within
seconds without refresh; the doctor-leave flow is covered by a Playwright test.

---

## Phase 3 · Telugu-first patient experience and the OPD queue — ~1.5 weeks

### 3a · WhatsApp portal (`/p/[token]`)

- Mobile-first: clinic, doctor, date/time, address with a maps link, phone.
- Three big actions: **నిర్ధారించండి** Confirm · **సమయం మార్చండి** Change time ·
  **క్లినిక్‌కు కాల్ చేయండి** Call clinic. Visible te/en switch.
- Pending state while a request is in flight; success only after the API
  confirms.
- Share-to-WhatsApp (`wa.me/?text=`) with pre-filled Telugu/English text, no
  patient data beyond what the recipient needs.
- **All Telugu copy reviewed by native speakers before release.** Not machine
  translation.

### 3b · Portal token hardening

`patient_access_tokens` already stores hashes with expiry. Add:

- a **scope** column (`view_appointment`, `confirm`, `reschedule`) so a
  confirmation link can't read prescriptions;
- rate-limiting on token validation;
- `Referrer-Policy: no-referrer` and `Cache-Control: no-store` on portal
  responses;
- tests: expired token, revoked token, token for patient A used against
  patient B.

### 3c · Shared family phones

Identity is `(clinic_id, phone_e164, name)`. Each link names the patient it is
for and exposes nothing about siblings on the same number. In `/me`, a
`FamilyProfileSwitcher` only if the account is explicitly linked to multiple
patients — verify the current account model before building.

### 3d · OPD token queue

`appointments.token_number` is already in the schema.

- **Walk-in fast-pass:** phone + name → next token, one dialog, keyboard-only.
- **Portal badge:** "Your token #14 · Now serving #9 · ~25 min" — the estimate
  labelled as an estimate.
- **`/dashboard/display`:** fullscreen TV view, current token per doctor, a
  chime on change. Read-only, staff-authenticated.

### 3e · Patient record polish

- `DosageVisualizer`: 🌅 morning · ☀️ afternoon · 🌙 night, before/after food as
  labelled badges.
- `/print/rx/[consultationId]`: A4 print stylesheet — clinic header, doctor,
  vitals, bilingual prescription table, QR back to the portal.

**Exit:** a Telugu-only tester confirms an appointment on a low-end Android
phone without help.

---

## Phase 4 · Security verification — ~1 week, alongside Phases 2–3

Not left to the end.

- **Read audit.** New append-only `record_access_log` (staff user, patient,
  record type, timestamp, request id), written by API middleware on every
  clinical read. Closes the gap in `security.md`.
- **Access-control matrix as tests:** clinic A ↛ clinic B; receptionist ↛
  owner settings; doctor ↛ other clinic's records; revoked staff loses access
  on next request; family member ↛ sibling's record via shared phone.
- **Transcripts:** retention period per clinic, access restricted by role,
  access audited, never sent whole to logs or analytics.
- **Security events:** log repeated auth failures, cross-tenant denials,
  unusual token validation volume, role changes.
- DPDP Act applicability review written into `security.md`.

---

## Phase 5 · Reliability and integrations — vendor-blocked

Starts the day a telephony account exists. Telephony first (roadmap §4).

- **Outbox worker in Postgres, not BullMQ.** `messages` is already an outbox.
  A worker in `apps/api/src/workers/` claims `queued` rows with
  `FOR UPDATE SKIP LOCKED`, sends, records provider message ID, retries with
  backoff, and is idempotent on that ID. Status webhooks move `sent →
  delivered → read`.
- **Scheduling via `pg_cron`:** 08:00 IST reminders enqueue into `messages`;
  an escalation job raises severity on `urgent` action items open > 30 min.
- **Correlation IDs** from inbound call → API request → AI turn → tool call →
  DB transaction → message.
- **`/dashboard/integrations`:** one card each for telephony, STT, TTS,
  WhatsApp, database, model — last success, last error, recent failure rate.
  Only built once there is something real to report on.
- **Call inspection workspace** on `/dashboard/calls/[id]`: overview, turn-by-
  turn timeline with tool calls from `call_tool_invocations`, booking audit,
  quality flags. The read-only live transcript drawer comes from this.
- **Telugu benchmark set:** Telugu, English, code-switched, informal dates,
  doctor names, noise, emergencies. Measure task outcomes (date right? doctor
  right? booking committed?) not just WER. Emergency recall gets its own
  threshold and is never inferred from "no keyword matched".
- **Failure tests:** DB down mid-booking, model timeout, duplicate webhooks,
  doctor leave during an active booking. The AI must never announce a booking
  the database didn't commit.

---

## Phase 6 · Adoption — after Phase 0 has answers

- **Onboarding wizard:** clinic profile → doctors & services → hours, breaks,
  holidays → FAQs & fees → AI greeting and escalation (emergency policy is
  fixed, not free text) → guided test call → go-live checklist that refuses
  "live" until required integrations pass health checks.
- **Landing page:** honest hero; an **interactive demo** using the existing
  mock mode, clearly labelled as sample data, with the booking appearing in a
  mock dashboard; how it works in three steps; a plain-language privacy
  section; an ROI calculator (missed calls/day, fee, % who'd book) that shows
  its assumptions and doesn't count every recovered call as new revenue.
  Pricing, testimonials and clinic logos only once they're real.
- **Usage dashboard** on `/dashboard/usage` from `usage_events` /
  `v_call_costs`: cost per call, cost per booking, by vendor.
- **Telugu landing page** — written in Telugu, not translated button by button.
- `Cmd+K` palette.

---

## Later

Waitlist (needs transaction-safe holds and consent), no-show analytics,
recurring appointments, doctor workload, patient feedback, UPI/Razorpay,
Telugu audio prescriptions, predictive no-show, more languages.

---

## Order at a glance

```
0 Clinic conversations      now, parallel        decides price and claims
1 Foundation                ~1 week              CI catches what people did
2 Command + Trust Center    ~2 weeks             signature staff experience
3 Telugu patient + OPD      ~1.5 weeks           signature patient experience
4 Security verification     ~1 week, parallel    before any real patient data
5 Reliability/integrations  vendor-blocked       telephony first
6 Adoption                  after Phase 0        onboarding, landing, usage
```

Phases 1–4 are about five weeks of work and need no vendor. They produce a
product a clinic can pilot with staff oversight. Phase 5 is what makes it a
service. Phase 0 is what tells you which of the rest is worth doing.
