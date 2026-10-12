# Roadmap

Where this stands and what to do next, in the order worth doing it.

Written after a full pass against the live Supabase project. Everything marked
**verified** was observed running; everything else is a claim about code that
has not been exercised end to end.

---

## Where it actually stands

| | |
|---|---|
| Database | **Verified.** 19 migrations, 38 tables, 133 RLS policies, 0 tables without RLS, live in `ap-south-1`. |
| Tenant isolation | **Verified** with real logins — two clinics, neither able to see the other. |
| API | **Verified** for the staff and patient routes the UI calls. |
| Staff dashboard | **Verified** against live data. |
| Patient record | **Verified** against live data. |
| Telephony, STT, TTS, WhatsApp | **Nothing.** No carrier, no vendor, nothing sends. |
| Frontend tests | **None.** Zero. |
| Lint | **No config at all.** |
| E2E | **None.** |

The last three are why this document starts where it does. Every bug found in
the last review — a 500 on Settings → Staff, a blank sign-up panel, a button at
2.55:1 contrast, an endpoint the UI called that did not exist — was found by a
person clicking. Not one was caught by CI.

---

## 1 · Design: one theme, done properly — 1 day

Dark mode goes. There are **zero `dark:` variants in the markup** — it is all
token-driven — so removal is a 33-line CSS block, `ThemeProvider`,
`ThemeToggle`, `darkMode: "class"`, and the toggle in six files.

The point is not simplicity. It is that one palette can be made genuinely good
instead of two being perpetually compromised. Both contrast failures found so
far came from maintaining two.

Then, in this order:

- **White, not mint.** `--surface` is `#EDF8F4`, a tinted wash that stops cards
  separating and makes everything slightly murky. Pure white pages and cards; a
  faint tint only for banded sections.
- **Tinted shadows.** The polish trick worth copying: shadows carry the brand
  hue, not grey — a hairline border plus a very large, very soft coloured glow.
  A few token changes, disproportionate effect.
- **Type from size, not weight.** Large and light reads as considered; bold and
  small reads as admin panel. Note the constraint: fonts are deliberately
  vendored rather than fetched at build time — that decision broke CI once — so
  a new face means vendoring ~40KB, not adding a `<link>`.

Re-apply landing → `/signin` → patient record → staff dashboard. Landing first,
because the type scale proves itself there before it reaches dense screens.

> Marketing-site devices do not transfer wholesale. 84px headlines and 60px
> glows belong on the landing page, not on the screen where a receptionist
> checks today's queue.

## 2 · Stop finding bugs by hand — 2 days

The highest-value engineering work in this list, because it changes the rate at
which everything else breaks.

- **ESLint + `eslint-config-next`.** There is no config. `react-hooks/exhaustive-deps`
  alone would have caught real issues, and the rules that flag unused code would
  have caught the dead `/me/tasks` mutation.
- **Playwright, four flows.** Sign in as staff → dashboard loads. Sign in as
  patient → record loads. Action Required → review → dispatch. Book the same
  slot twice → the second fails. Those four cover every bug found by hand so
  far. Run them in CI against a seeded database.
- **Component tests** for the pieces with real logic: `isActiveRx`, the date
  helpers, the tile builder, the care-task overdue maths.
- **`error.tsx` and `not-found.tsx`.** Neither exists, so an unhandled render
  error currently shows the Next default.

## 3 · Finish what is half-built — 2 days

- **Role-gated UI.** `requireRole` guards the API and `useCanAdminister` exists,
  but no one has signed in as a receptionist and confirmed that fee editing and
  AI permissions are actually hidden. Verify, then test it.
- **Clinic-local times.** Action descriptions print raw UTC
  (`2026-10-12 03:30:00+00`) because the trust-flow trigger formats a
  `timestamptz` directly. Format in the UI against the clinic timezone.
- **Google OAuth.** The button is wired; the provider is not configured in
  Supabase. Either configure it or hide the button — a dead control is worse
  than no control.
- **Rate-limit clarity.** A 429 currently surfaces as "that email and password
  did not match", so a lockout is indistinguishable from a typo.
- **Redis.** Without `REDIS_URL` the limiter is per-instance and resets on
  restart. Required before a second instance, not before the first.

## 4 · The integrations the product rests on — weeks, vendor-blocked

None of this is startable without an account, and all of it is downstream of a
real phone ringing.

| | Needs |
|---|---|
| Telephony | Exotel or Twilio, and a number per clinic. `POST /api/voice/calls` is already shaped for the webhook. |
| STT / TTS | Sarvam or Deepgram. Turns are text in, text out today. |
| WhatsApp | Meta Cloud API and pre-approved templates. Messages render and queue; nothing sends. |
| Workers | Nothing is scheduled. Reminders and batch dispatch do not run. |

**Telephony first.** Everything else in this table is improved by it and
pointless without it.

## 5 · The thing none of this fixes

Talk to 8–10 clinic owners.

It was in the original blueprint as Weeks 1–2 and has not happened. It was
blocked on having something to show, and that is no longer true — there is a
working product on a real database in two languages.

A direct competitor is already live: **frontel.ai**, "the AI receptionist for
Indian clinics", Hindi/Marathi/Tamil, claiming 47 clinics, with published
pricing and a demo line. That is not a reason to stop. It is a reason to find
out what those clinics are paying and why, before building another month of
features against an assumption.

Ten conversations answer that. No amount of code does.

---

## Order, and why

```
1 Design           ← 1 day,  highest visible return
2 Test tooling     ← 2 days, lowers the cost of everything after it
3 Half-built work  ← 2 days, removes known-wrong behaviour
4 Integrations     ← weeks,  blocked on vendor accounts
5 Customers        ← this week, blocks nothing and decides everything
```

1–3 are about a week and leave the product demonstrably solid. 4 is the real
build. 5 should start in parallel today — it does not compete with any of them
for time, and it is the only item that can tell you the other four are worth
doing.
