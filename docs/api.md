# API

Base URL `/api`. All responses are JSON. Errors use one envelope:

```json
{ "error": { "code": "SLOT_TAKEN", "message": "That time is no longer available.",
             "hint": "Fetch fresh availability and offer the next free slot." },
  "requestId": "2d0ddae3-..." }
```

Switch on `error.code`, never on the message text. `requestId` is echoed as the
`x-request-id` header and appears on every log line for that request.

## Authentication

| Surface | Header | Tenancy |
|---|---|---|
| Staff routes | `Authorization: Bearer <supabase jwt>` | resolved from `clinic_members` |
| Machine routes (`/api/voice`, `/api/webhooks/*`) | `x-sahva-key: <VOICE_API_KEY>` | resolved from the **dialed** number |

The clinic is never read from a request body or query parameter. Staff requests
run through an RLS-scoped Supabase client, so Postgres decides which rows exist.

An unauthenticated request to a non-existent `/api` route returns 401, not 404 —
route existence is not something an anonymous caller should be able to probe.

## Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Wrong role, or not a member of the clinic |
| `VALIDATION_FAILED` | 400 | Request failed its zod schema; see `detail` |
| `NOT_FOUND` | 404 | No such record, within your clinic |
| `SLOT_TAKEN` | 409 | **The no-double-booking constraint fired.** Re-fetch availability. |
| `ALREADY_EXISTS` | 409 | Unique violation |
| `INVALID_REFERENCE` | 409 | FK violation — often a cross-tenant id |
| `CONSTRAINT_VIOLATED` | 400 | A CHECK constraint refused the change |
| `BATCH_NOT_DRAFT` | 400 | Reschedule batch already dispatched |
| `DATABASE_ERROR` | 500 | Unmapped Postgres error |

## Staff routes

### Clinic
| | |
|---|---|
| `GET /clinic` | clinic + settings |
| `GET /clinic/hours` | weekly operating hours |
| `GET /clinic/closures` | upcoming holidays |
| `PATCH /clinic/settings` | owner/manager only |

### Doctors
| | |
|---|---|
| `GET /doctors` | all active doctors |
| `GET /doctors/:id/sessions` | recurring weekly blocks |
| `GET /doctors/:id/availability?date=YYYY-MM-DD` | **live** free slots |
| `POST /doctors/time-off` | **triggers the Action Required flow** |
| `DELETE /doctors/time-off/:id` | owner/manager only |

`POST /doctors/time-off` returns `{ time_off, batch }`. The batch is created in
`draft` by a database trigger, with `total_affected` already counted — so the UI
can tell staff how many patients are involved before they decide anything. No
appointment is cancelled and no patient is messaged.

### Appointments
| | |
|---|---|
| `GET /appointments?from&to&status&doctor_id` | paginated |
| `GET /appointments/today` | today's board, clinic-local |
| `GET /appointments/needs-reschedule` | flagged by the trust flow |
| `GET /appointments/:id` | includes the full `appointment_events` audit trail |
| `POST /appointments` | book — same guarded RPC the AI uses |
| `POST /appointments/:id/reschedule` | |
| `POST /appointments/:id/cancel` | |
| `POST /appointments/:id/status` | confirm / check in / complete / no-show |

Booking can return `409 SLOT_TAKEN`. That is the database refusing a real double
booking, not a bug — surface it and offer another time.

### Action Required
| | |
|---|---|
| `GET /actions` | the open queue, worst first |
| `GET /actions/batches/:id` | a reschedule batch with every affected patient |
| `POST /actions/batches/:id/dispatch` | **the deliberate human step** |
| `POST /actions/:id/resolve` | resolve or dismiss, with a note |
| `POST /actions/:id/assign` | assign to a staff member |

`dispatched_by` is stamped from the session and cannot be supplied by the
client. A CHECK constraint rejects the transition without it.

### Calls, patients, analytics, messages
| | |
|---|---|
| `GET /calls?outcome&language&recovered` | |
| `GET /calls/:id` | transcript + **every tool the model attempted**, including refusals |
| `GET /patients?q=` · `GET /patients/:id` · `GET /patients/by-phone/:phone` | |
| `GET /analytics/summary?days=7` | KPIs, including measured cost per call |
| `GET /analytics/costs?days=30` | per-call vendor cost |
| `GET /analytics/utilisation` | per doctor per day |
| `GET /messages` · `GET /messages/preview/:appointmentId` · `POST /messages/queue` | |

## Patient portal

Patients in this segment do not install apps or remember passwords, so the
portal is reached by a capability link sent over WhatsApp. Tapping it proves
possession of the phone the clinic already has on file.

| | |
|---|---|
| `GET /portal/:token` | patient, clinic, permissions, upcoming and past appointments |
| `GET /portal/:token/hours` | opening hours and closures |
| `POST /portal/:token/appointments/:id/confirm` | patient confirms they will attend |
| `GET /portal/:token/appointments/:id/slots?date=` | free slots for that appointment's doctor |
| `POST /portal/:token/appointments/:id/reschedule` | subject to `patient_may_reschedule` |
| `POST /portal/:token/appointments/:id/cancel` | subject to `patient_may_cancel` (off by default) |

Staff issue and revoke links from the patients screen:

| | |
|---|---|
| `POST /patients/:id/portal-link` | returns the raw URL **once**; only its hash is stored |
| `GET /patients/:id/portal-link` | live links, so staff can see and revoke what is out there |
| `DELETE /patients/portal-link/:tokenId` | revoke |

**Security.** The token is a bearer credential and is treated as one: 32 bytes
of CSPRNG entropy, stored as a SHA-256 hash, scoped to one patient at one
clinic, expiring, revocable. Unknown, expired and revoked all resolve to the
same response, so a bad link cannot be used to probe whether it ever existed.
Every query is scoped to the patient the token resolves to — a `patient_id` in
a request body is never read. The portal reads through
`v_patient_appointments`, which exposes logistics only: no notes, no diagnosis,
no clinical history, because a forwarded link must not leak one.

## Machine routes

| | |
|---|---|
| `POST /voice/calls` | start a call; resolves the clinic from `to_e164` |
| `POST /voice/calls/:id/turn` | one conversational turn |
| `POST /voice/calls/:id/end` | finalise outcome, summary, telephony usage |
| `GET /voice/calls/:id` | live transcript |
| `POST /webhooks/messages/delivery` | delivery receipts |

`POST /voice/calls` is idempotent on `(provider, provider_call_sid)` — carriers
retry, and a retry must not create a second call.

Conversation state lives in `call_turns`, not in the client. A phone call has no
browser, so every turn rebuilds history from the database.

Escalation keywords are checked **before** the model sees the text. A medical
emergency must not depend on the model choosing to escalate.
