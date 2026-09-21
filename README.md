# ClinicVoice AI — Demo

An AI voice receptionist for Indian clinics. Answers inbound calls in **English and Telugu**, books / reschedules / cancels appointments, and sends a **WhatsApp confirmation** — built as a runnable demo for sales pitches to clinic owners.

> This is a **demo**, not production. Telephony and WhatsApp are simulated. The conversation AI, persistence, and admin dashboard are real.

## Architecture

```
apps/
├── api/   Node 20 + Express + better-sqlite3 + Anthropic SDK
└── web/   Next.js 14 (app router) + Tailwind + Recharts
```

`npm run dev` at the root starts both: API on `:4000`, web on `:3000` (proxied via Next.js rewrites).

## Quick start

```bash
# 1. Install
npm install

# 2. Add your API keys
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# 3. Run
npm run dev
```

- Web: <http://localhost:3000>
- API: <http://localhost:4000/api/health>

The SQLite database is created on first boot at `apps/api/data/clinicvoice.db` and seeded with **Sri Sai Clinic, Warangal**, 3 doctors, 5 patients, 8 appointments, and 4 past calls.

## What to try

1. **Landing page** (`/`) — explains the product, has a "Start demo call" button.
2. **Live call** (`/call`) — click the mic, say e.g. *"I'd like to book an appointment with Dr. Anitha Reddy tomorrow at 10 AM"*. The AI receptionist greets you, asks for name/phone, books the slot, and shows a **WhatsApp confirmation preview**. You can also speak in Telugu.
3. **Dashboard** (`/dashboard`) — KPIs, weekly call chart, language mix, recent calls, today's appointments.
4. **Calls log** (`/dashboard/calls`) — every call with a click-to-open transcript.
5. **Appointments** (`/dashboard/appointments`) — calendar and list view.
6. **Analytics** (`/dashboard/analytics`) — bigger charts and the headline metrics.

## Required environment variables

| Variable | Required? | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | For the conversation AI (`claude-sonnet-4-6`). |
| `ELEVENLABS_API_KEY` | No | Reserved. The demo uses browser TTS by default. |
| `PORT` | No | API port, default `4000`. |

## API surface

All routes return JSON. Errors come back as `{ "error": "..." }`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/clinic` | single clinic profile |
| GET | `/api/doctors` | list doctors |
| GET | `/api/patients?q=` | search patients |
| GET | `/api/appointments?from&to&status` | list with patient + doctor joined |
| GET | `/api/appointments/calendar?from&to` | grouped by day |
| GET | `/api/calls?limit&outcome` | recent calls with parsed transcript |
| GET | `/api/calls/:id` | full call + transcript |
| GET | `/api/analytics/summary` | KPIs, week chart data, language split |
| POST | `/api/voice/turn` | `{ callId?, userText, history? }` → Claude + tool loop |
| POST | `/api/voice/end` | finalises call outcome / summary |
| POST | `/api/whatsapp/preview` | `{ appointmentId }` → message body |

### Tools exposed to the model

- `check_availability(doctor, date)` — free 15-min slots, 09:00–17:00 IST, lunch 13:00–14:00 excluded
- `book_appointment(patient_name, phone, doctor, starts_at, reason?)`
- `reschedule_appointment(phone, new_starts_at, doctor?)`
- `cancel_appointment(phone)`

## Voice pipeline

```
Browser mic ─► Web Speech API (STT) ─► text turn ─► POST /api/voice/turn
                                                         │
                                                         ▼
                                                  Claude Sonnet 4.6
                                                  (with 4 tools)
                                                         │
                                                         ▼
Browser TTS ◄─ assistantText ◄─ { assistantText, toolCalls, whatsappPreview }
```

The receptionist is **Maya**. She mirrors the caller's language (Telugu Unicode detection), follows the clinic's hours, and never invents availability.

## Deploying later

- **Web** → Vercel (`apps/web`). No changes required.
- **API** → Railway / Fly / Render (`apps/api`). The Express service is self-contained; SQLite is fine for a single-instance demo. Swap to Postgres when going multi-tenant.

## Tech stack

| | |
|---|---|
| Backend | Node 20, Express 4, better-sqlite3 12, TypeScript, Anthropic SDK |
| Frontend | Next.js 14, React 18, Tailwind 3, Recharts 2, TypeScript |
| Voice | Web Speech API (browser STT) + `speechSynthesis` (browser TTS) |
| Data | SQLite (single file, seeded on first boot) |

## Out of scope (deliberately)

- Real telephony (Twilio/Exotel) — the demo uses the browser
- Real WhatsApp Business API — the UI shows a mock preview
- Multi-tenant auth — single clinic assumed
- Production hardening (rate limits, request validation, retries, observability)
