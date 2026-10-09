import Link from "next/link";
import { Icon } from "@/components/icons";

/**
 * Landing page.
 *
 * This is the surface a clinic owner sees during a founder-led sales visit,
 * usually on a phone in the clinic. It leads with the number that hurts —
 * missed calls — rather than with the technology.
 */
export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-surface">
      <Header />
      <Hero />
      <Proof />
      <Features />
      <Trust />
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 glass">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-[11px] bg-gradient-to-br from-brand-400 to-brand-700 font-display text-base font-extrabold text-white shadow-glow"
          >
            S
          </span>
          <span>
            <span className="block font-display text-[15px] font-bold tracking-tight text-ink">
              SAHVA
            </span>
            <span className="block text-[11px] text-ink-subtle">AI receptionist</span>
          </span>
        </div>
        <Link
          href="/login"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white shadow-glow transition duration-200 ease-spring hover:bg-brand-700 active:scale-[.97]"
        >
          Staff sign in
          <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 aurora" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 grid-fade opacity-50" aria-hidden />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-muted shadow-xs">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-500" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-600" />
            </span>
            తెలుగు &amp; English · 24/7
          </span>

          <h1 className="mt-6 font-display text-display-xl text-ink">
            Your clinic&rsquo;s phone,
            <br />
            <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-brand-700 bg-clip-text text-transparent">
              always answered.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-muted">
            A third of calls to a small clinic go unanswered — and those patients just ring the next
            clinic on their list. SAHVA picks up every one, in Telugu or English, and books real
            appointments against your live schedule.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-6 text-[15px] font-medium text-white shadow-glow transition duration-200 ease-spring hover:bg-brand-700 active:scale-[.97]"
            >
              Staff sign in
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
            <a
              href="#how"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-line-strong bg-surface-raised px-6 text-[15px] font-medium text-ink transition hover:bg-surface-sunken"
            >
              How it works
            </a>
          </div>

          <dl className="mt-10 grid max-w-md grid-cols-3 gap-6">
            {[
              { v: "24/7", l: "Always picks up" },
              { v: "2", l: "Languages, mid-sentence" },
              { v: "0", l: "Double bookings, ever" },
            ].map((s) => (
              <div key={s.l}>
                <dt className="font-display text-2xl font-bold tracking-tight text-ink">{s.v}</dt>
                <dd className="mt-1 text-xs leading-snug text-ink-subtle">{s.l}</dd>
              </div>
            ))}
          </dl>
        </div>

        <CallPreview />
      </div>
    </section>
  );
}

/** A still of a real call. Shows the product rather than describing it. */
function CallPreview() {
  const turns = [
    { who: "ai", text: "నమస్తే, శ్రీ సాయి క్లినిక్. నేను మాయ. మీకు ఎలా సహాయం చేయగలను?" },
    { who: "caller", text: "డాక్టర్ అనిత గారిని కలవాలి" },
    { who: "ai", text: "రేపు ఉదయం 10:00 లేదా 10:30 ఖాళీ ఉంది. ఏది అనుకూలం?" },
    { who: "caller", text: "10 o'clock fine. Ravi Kumar, 98765 43210" },
  ];

  return (
    <div className="relative animate-fade-up [animation-delay:120ms]">
      <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-brand-500/15 to-accent-violet/10 blur-2xl" aria-hidden />
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface-raised shadow-lift">
        <div className="flex items-center gap-2 border-b border-line bg-surface-sunken/60 px-4 py-3">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-500" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
          </span>
          <span className="text-xs font-medium text-ink-muted">Live call · 9:42 PM</span>
          <span className="ml-auto rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle ring-1 ring-inset ring-line">
            After hours
          </span>
        </div>

        <div className="space-y-3 p-4">
          {turns.map((t, i) => (
            <div
              key={i}
              className={`flex animate-fade-up ${t.who === "caller" ? "justify-end" : "justify-start"}`}
              style={{ animationDelay: `${240 + i * 110}ms` }}
            >
              <p
                className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  t.who === "caller"
                    ? "rounded-br-md bg-brand-600 text-white"
                    : "rounded-bl-md bg-surface-sunken text-ink"
                }`}
              >
                {t.text}
              </p>
            </div>
          ))}

          <div
            className="flex items-center gap-3 rounded-2xl border border-brand-500/25 bg-brand-500/[0.07] p-3 animate-fade-up"
            style={{ animationDelay: "720ms" }}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
              <Icon name="check" className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">
                Appointment booked
              </p>
              <p className="truncate text-sm font-medium text-ink">
                Dr Anitha · tomorrow, 10:00 AM
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Proof() {
  return (
    <section className="border-y border-line bg-surface-sunken/50">
      <div className="mx-auto grid max-w-6xl gap-px overflow-hidden px-5 py-12 sm:grid-cols-3">
        {[
          { n: "~1 in 3", l: "calls to a small clinic go unanswered", sub: "2026 India clinic reports" },
          { n: "9 PM", l: "when patients actually call", sub: "and nobody is at the desk" },
          { n: "₹3.59", l: "measured cost per call", sub: "on a ₹999/month plan" },
        ].map((s, i) => (
          <div
            key={s.l}
            className="animate-fade-up px-2 text-center sm:px-6"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <p className="font-display text-stat text-brand-600">{s.n}</p>
            <p className="mt-2 text-sm font-medium text-ink">{s.l}</p>
            <p className="mt-0.5 text-xs text-ink-subtle">{s.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const items = [
    {
      icon: "calls" as const,
      title: "Answers every call",
      body: "Including at 9 PM on a Sunday, which is exactly when a worried parent rings and nobody is at the desk.",
    },
    {
      icon: "appointments" as const,
      title: "Books off live availability",
      body: "Every slot is re-checked against the real schedule at the moment of booking. Double-booking is impossible, not unlikely.",
    },
    {
      icon: "shield" as const,
      title: "Never cancels quietly",
      body: "If a doctor becomes unavailable, affected patients are flagged for your staff to handle — never dropped without anyone knowing.",
    },
    {
      icon: "language" as const,
      title: "Telugu, properly",
      body: "Not Hindi with a Telugu label. It follows code-switching mid-sentence, the way people actually speak here.",
    },
  ];

  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-20">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">
          What it does
        </p>
        <h2 className="mt-3 font-display text-display-lg text-ink">
          Built for a clinic, not a call centre.
        </h2>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {items.map((f, i) => (
          <article
            key={f.title}
            className="card-hover animate-fade-up rounded-2xl border border-line bg-surface-raised p-6"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-500/10 text-brand-600 ring-1 ring-inset ring-brand-500/20">
              <Icon name={f.icon} className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-display text-[17px] font-semibold tracking-tight text-ink">
              {f.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Trust() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface-raised p-8 sm:p-12">
        <div className="pointer-events-none absolute inset-0 aurora" aria-hidden />
        <div className="relative max-w-2xl">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 text-white shadow-glow">
            <Icon name="shield" className="h-5 w-5" />
          </span>
          <h2 className="mt-5 font-display text-display-md text-ink">
            The part most AI receptionists get wrong
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
            A wrong restaurant booking is an annoyance. A wrong medical appointment is a patient who
            turns up to a closed door. So SAHVA never guesses: when a doctor goes unavailable, every
            affected patient lands in an <strong className="text-ink">Action Required</strong> queue
            for a human to handle. Nothing is cancelled silently, and no message goes out until
            someone presses send.
          </p>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8">
        <p className="text-xs text-ink-subtle">
          SAHVA · Built for clinics in Warangal, Karimnagar and everywhere the metro SaaS never
          visits.
        </p>
        <Link href="/login" className="text-xs font-medium text-brand-600 hover:text-brand-700">
          Staff sign in →
        </Link>
      </div>
    </footer>
  );
}
