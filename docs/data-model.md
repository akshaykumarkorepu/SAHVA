# Data model

37 tables, 6 views, 128 indexes, 120 RLS policies. This document covers the
decisions that are not obvious from reading the DDL.

## Shape

```
                          ┌──────────┐
                          │ clinics  │◄───── the tenant root
                          └────┬─────┘
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
┌──────▼───────┐      ┌────────▼────────┐     ┌────────▼────────┐
│clinic_members│      │ clinic_settings │     │  clinic_hours   │
│  (RLS anchor)│      │ clinic_closures │     │  clinic_faqs    │
└──────┬───────┘      └─────────────────┘     │ clinic_services │
       │                                      └─────────────────┘
┌──────▼────────┐
│staff_profiles │──1:1──► auth.users
└───────────────┘

┌─────────┐     ┌──────────────────┐     ┌──────────────────┐
│ doctors │────►│ doctor_sessions  │     │ doctor_time_off  │
└────┬────┘     │ (recurring week) │     │  (the exception) │
     │          └──────────────────┘     └────────┬─────────┘
     │                                            │ trigger
     │   ┌──────────┐                             ▼
     └──►│appointments│◄──── patients    ┌──────────────────────┐
         └─────┬──────┘                  │ reschedule_batches   │
               │                         │ reschedule_batch_… │
        ┌──────▼────────────┐            │ action_items         │
        │appointment_events │            └──────────────────────┘
        │  (append-only)    │
        └───────────────────┘

┌───────┐    ┌────────────┐   ┌────────────────────────┐
│ calls │───►│ call_turns │   │ call_tool_invocations  │
└───┬───┘    └────────────┘   │ (intent vs. authority) │
    │                         └────────────────────────┘
    └──► usage_events ──► v_call_costs   (unit economics)
```

## Conventions

- **uuid primary keys.** Sequential ids leak tenant volume across a shared API
  surface and make cross-tenant id guessing trivial.
- **timestamptz, stored UTC.** Clinic-local rendering goes through
  `clinics.timezone`. Naive local time is never stored.
- **Money is an integer count of paise.** No floats anywhere near a fee.
  Vendor API costs use micro-INR (1 INR = 1,000,000) because LLM token pricing
  rounds to zero in paise.
- **`clinic_id` on every tenant table.** Deliberately denormalised.

## Decisions

### Why `clinic_id` is repeated on child tables

Strictly redundant — `appointments.clinic_id` is derivable through
`doctor_id → doctors.clinic_id`. It is kept because every RLS policy and
almost every dashboard query filters by tenant first. Requiring a join to
establish tenancy is slower, and a `WHERE` clause one join away from being
forgotten is exactly how one clinic ends up seeing another's data.

It is not enforced by application discipline. Composite foreign keys do it:

```sql
unique (id, clinic_id)                                    -- on doctors, patients
foreign key (doctor_id, clinic_id)
  references public.doctors(id, clinic_id)                -- on appointments
```

An appointment pairing clinic A's doctor with clinic B's patient raises
`foreign_key_violation`. This holds for `service_role` too, which bypasses RLS
entirely — so the guarantee survives a bug in the voice agent.

### Patient identity is (clinic, phone, name) — not (clinic, phone)

One handset routinely serves a whole family. A mother books for herself and for
two children on the same number, which is the norm in paediatrics, one of the
target specialties. Making the phone number unique per clinic would force those
into one record or into fake phone numbers.

```sql
create unique index patients_identity_idx
  on public.patients (clinic_id, phone_e164, lower(btrim(full_name)));
```

`approx_age_years` sits beside `date_of_birth` for the same reason: phone
callers give an age, not a birth date, and fabricating a DOB from an age
corrupts the vaccination schedule downstream.

### Availability is computed, never stored

There is no `slots` table. `sahva.available_slots(doctor, date)` derives free
times on every call from `doctor_sessions`, minus `clinic_closures`, minus
`doctor_time_off`, minus booked appointments, minus the min-notice and booking
horizon from `clinic_settings`.

A materialised slot table would need invalidating on every schedule edit, leave
entry and booking — and a stale slot offered on a live call is precisely the
failure the product exists to prevent.

`doctor_sessions` carries `effective_from` / `effective_to` so a schedule change
does not rewrite history: last month's bookings still reconcile against the
hours that were in force then.

### Double-booking is impossible, not merely unlikely

```sql
exclude using gist (
  doctor_id with =,
  tstzrange(starts_at, ends_at, '[)') with &&
) where (status in ('booked','confirmed','checked_in'))
```

Two simultaneous callers can both pass the availability check; only one commits.
Cancelled, no-show and `needs_reschedule` rows fall outside the predicate, so a
freed slot is instantly rebookable.

**Caveat:** clinics using a token system with `capacity_per_slot > 1` must drop
this constraint and rely on the counting in `available_slots()`. The schema
models capacity honestly rather than pretending one slot holds one patient.

### The transcript is rows, not a JSON blob

`call_turns` is one row per utterance with `language`, `stt_confidence` and
`latency_ms`. The blueprint names dialectal Telugu ASR as an unsolved,
industry-wide problem; fixing it means querying "every caller turn under 0.7
confidence, in Telugu, last month". A JSON column cannot answer that.

`call_tool_invocations` records what the model **asked** for alongside whether
the backend **allowed** it, with the denial reason. That is the audit seam for
the architecture principle, and the evidence that a guard rail fired.

### The trust flow lives in the database

Inserting a `doctor_time_off` row fires `sahva.sweep_time_off()`, which:

1. opens a **draft** `reschedule_batch`;
2. moves overlapping live appointments to `needs_reschedule` — keeping the row,
   the patient link and the history, and freeing the slot;
3. writes a `flagged_for_reschedule` event per appointment;
4. inserts one `reschedule_batch_item` per affected patient;
5. raises one `action_items` row, severity scaled by how soon the window starts.

Nothing is cancelled. No message is sent. `reschedule_batches_human_dispatch`
is a CHECK constraint requiring `dispatched_by` before the batch leaves draft,
so mass patient messaging cannot happen without a named human.

It is a trigger rather than application code because the guarantee has to hold
regardless of which client wrote the row — dashboard, API, or someone in psql.

### Appointment history cannot be edited

`appointment_events` and `call_turns` reject `UPDATE` and `DELETE` via trigger.
"We never changed your appointment without telling you" is only worth saying if
the record backing it is immutable.

### Two invoice tables, on purpose

`subscription_invoices` is Sahva billing the clinic. `patient_invoices` is the
clinic billing the patient. Different debtors, different lifecycles, different
readers. One polymorphic table would need a discriminator on every query.

### Unit economics are measured, not estimated

`usage_events` records one row per metered vendor unit, with
`cost_micro_inr` **generated** from quantity × unit price, so a row cannot
carry a cost that disagrees with its own inputs. `v_call_costs` rolls it up per
call.

Against the blueprint's own quoted vendor rates (STT ₹40/hr, TTS ₹22/10k chars,
telephony ₹0.50/min, GPT-4o-mini-class LLM), the seeded 108-second call costs:

| Component | ₹ |
|---|---|
| STT | 1.200 |
| TTS | 1.408 |
| LLM | 0.080 |
| Telephony | 0.900 |
| **Total** | **3.588** |

100 calls/month ≈ **₹359**, not the "comfortably under ₹200–300" the blueprint
assumes. That range is only reachable at the low end of every vendor quote
simultaneously. Gross margin on a ₹999 Starter tier is still ~64%, so the
pricing holds — but the estimate should be corrected before it goes in a deck,
and TTS, not STT, is the largest line item. Measure it against real pilot calls
before finalising anything.

## Phase 2

`consultations`, `prescriptions` + `prescription_items`, `patient_conditions`,
`vaccine_catalogue` + `patient_vaccinations`, `care_plans` + `care_tasks`,
`patient_invoices` + items. Created now, unused for Phase 1, so that Phase 1
writes already carry the keys Phase 2 needs — no backfill later.

`consultations` keeps `raw_transcript` beside `formatted_note`: a doctor must
always be able to see what they actually dictated before the model tidied it.

## Known limitations

- **No pgvector.** FAQ retrieval is keyword and full-text only, because Telugu
  embedding quality is not yet reliable. Add a `vector(1536)` column plus an
  HNSW index when that changes.
- **No partitioning.** `calls`, `call_turns` and `usage_events` grow without
  bound. At roughly 100 calls per clinic per month this is years away, but
  monthly range partitioning on `started_at` / `occurred_at` is the exit.
- **`capacity_per_slot > 1` conflicts with the EXCLUDE constraint.** See above.
- **No soft deletes.** A deleted patient is gone. If medical record retention
  rules require otherwise, add `deleted_at` and adjust the RLS predicates.
- **Invoice numbering is not allocated by the database.** `patient_invoices`
  enforces `unique (clinic_id, invoice_number)` but the application generates
  the string; concurrent issuance needs a per-clinic sequence or advisory lock.
