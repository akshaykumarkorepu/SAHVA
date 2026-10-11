import Link from "next/link";
import { Icon } from "@/components/icons";

/**
 * The opening page.
 *
 * It has two readers and one job each. A clinic owner in Warangal needs to know
 * what it does, that it speaks Telugu properly, what it costs, and that it will
 * not quietly cancel a patient — in that order, above the fold where possible.
 * An investor needs the economics and the market, which sit below, after the
 * product has already made its case.
 *
 * Light, warm and high-contrast on purpose: this is opened on a mid-range
 * Android, often outdoors. Every text colour here clears WCAG AA.
 */

export default function HomePage() {
  return (
    <main className="min-h-[100dvh] bg-surface">
      <SiteHeader />
      <Hero />
      <ProblemBand />
      <ProductShot />
      <HowItWorks />
      <TeluguSection />
      <SafetyPromise />
      <Pricing />
      <Economics />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Chrome                                                                      */
/* -------------------------------------------------------------------------- */

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden
        className="grid h-9 w-9 place-items-center rounded-[11px] bg-gradient-to-br from-brand-500 to-brand-700 font-display text-base font-extrabold text-white"
      >
        S
      </span>
      <span>
        <span className="block font-display text-[15px] font-bold tracking-tight text-ink">SAHVA</span>
        <span className="block text-[11px] text-ink-subtle">AI receptionist</span>
      </span>
    </Link>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Wordmark />

        <nav className="hidden items-center gap-7 md:flex">
          {[
            ["How it works", "#how"],
            ["Telugu", "#telugu"],
            ["Pricing", "#pricing"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-medium text-ink-muted transition hover:text-ink"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/*
          One door. Which kind of person you are is a question the sign-in page
          asks; it is not two links in a header.
        */}
        <Link
          href="/signin"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-glow transition duration-200 ease-spring hover:bg-brand-700 active:scale-[.98]"
        >
          Sign in
          <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(44rem_26rem_at_8%_-12%,rgb(var(--brand-500)/0.10),transparent_62%),radial-gradient(34rem_22rem_at_96%_0%,rgb(var(--accent-amber)/0.07),transparent_60%)]"
      />

      <div className="relative mx-auto grid max-w-6xl gap-14 px-5 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-center lg:gap-16 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-600/25 bg-brand-500/10 px-3 py-1.5 text-[13px] font-semibold text-brand-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-600" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
            </span>
            తెలుగు &amp; English · 24/7
          </span>

          <h1 className="mt-6 font-display text-display-xl text-ink">
            Your clinic&rsquo;s phone,
            <br />
            <span className="text-brand-700">always answered.</span>
          </h1>

          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-muted sm:text-lg">
            A third of calls to a small clinic go unanswered — and those patients just ring the next
            clinic on the list. SAHVA picks up every one, in Telugu or English, and books real
            appointments against your live schedule.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="tel:+918702345678"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 text-[15px] font-semibold text-white shadow-glow transition duration-200 ease-spring hover:bg-brand-700 active:scale-[.98]"
            >
              <Icon name="calls" className="h-[18px] w-[18px]" />
              Hear it answer a call
            </a>
            <a
              href="#pricing"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface-raised px-6 text-[15px] font-semibold text-ink shadow-xs transition hover:border-ink/25 active:scale-[.98]"
            >
              See pricing
              <Icon name="arrowRight" className="h-4 w-4" />
            </a>
          </div>

          <p className="mt-4 text-[13px] text-ink-subtle">
            Ring the demo line and talk to Maya yourself. No form, no signup.
          </p>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-7">
            {[
              ["24/7", "Always picks up"],
              ["2", "Languages, mid-sentence"],
              ["0", "Double bookings, ever"],
            ].map(([stat, label]) => (
              <div key={label}>
                <dt className="font-display text-stat text-ink">{stat}</dt>
                <dd className="mt-1 text-[13px] leading-snug text-ink-muted">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <CallDemo />
      </div>
    </section>
  );
}

function CallDemo() {
  return (
    <div className="rounded-3xl border border-line bg-surface-raised p-4 shadow-lift sm:p-5">
      <div className="flex items-center justify-between gap-3 pb-4">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <span className="h-2 w-2 rounded-full bg-brand-600" />
          Live call · 9:42 PM
        </span>
        <span className="rounded-full bg-accent-amber/12 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-amber">
          After hours
        </span>
      </div>

      <div className="space-y-3 border-t border-line pt-4">
        <Bubble side="left" lang="te">
          నమస్తే, శ్రీ సాయి క్లినిక్. నేను మాయ. మీకు ఎలా సహాయం చేయగలను?
        </Bubble>
        <Bubble side="right" lang="te">
          డాక్టర్ అనిత గారిని కలవాలి
        </Bubble>
        <Bubble side="left" lang="te">
          రేపు ఉదయం 10:00 లేదా 10:30 ఖాళీ ఉంది. ఏది అనుకూలం?
        </Bubble>
        <Bubble side="right">10 o&rsquo;clock fine. Ravi Kumar, 98765 43210</Bubble>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-brand-600/25 bg-brand-500/10 p-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
          <Icon name="check" className="h-[18px] w-[18px]" />
        </span>
        <span>
          <span className="block text-[11px] font-bold uppercase tracking-wide text-brand-700">
            Appointment booked
          </span>
          <span className="block text-sm font-medium text-ink">Dr Anitha · tomorrow, 10:00 AM</span>
        </span>
      </div>
    </div>
  );
}

function Bubble({
  side,
  lang,
  children,
}: {
  side: "left" | "right";
  lang?: "te";
  children: React.ReactNode;
}) {
  const mine = side === "right";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <p
        lang={lang}
        className={[
          "max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed",
          lang === "te" ? "text-[15px] leading-[1.7]" : "",
          mine
            ? "rounded-br-md bg-brand-600 font-medium text-white"
            : "rounded-bl-md bg-surface-sunken text-ink",
        ].join(" ")}
      >
        {children}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Problem                                                                     */
/* -------------------------------------------------------------------------- */

function ProblemBand() {
  const items = [
    ["~1 in 3", "calls to a small clinic go unanswered", "2026 India clinic reports"],
    ["9 PM", "when patients actually call", "and nobody is at the desk"],
    ["₹3.59", "measured cost per call", "on a ₹999/month plan"],
  ];
  return (
    <section className="border-b border-line bg-surface-sunken">
      <div className="mx-auto grid max-w-6xl gap-px px-5 py-12 sm:grid-cols-3">
        {items.map(([stat, label, note]) => (
          <div key={label} className="px-2 text-center sm:px-6">
            <p className="font-display text-stat text-brand-700">{stat}</p>
            <p className="mt-2 text-sm font-semibold text-ink">{label}</p>
            <p className="mt-1 text-xs text-ink-subtle">{note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Product                                                                     */
/* -------------------------------------------------------------------------- */

function SectionHead({
  eyebrow,
  eyebrowLang,
  title,
  children,
  center = false,
}: {
  eyebrow: string;
  /** Telugu is never uppercased or letter-spaced — both are Latin conventions
   *  that do nothing in this script except break the conjuncts apart. */
  eyebrowLang?: "te";
  title: string;
  children?: React.ReactNode;
  center?: boolean;
}) {
  const te = eyebrowLang === "te";
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p
        lang={eyebrowLang}
        className={
          te
            ? "text-[15px] font-semibold leading-relaxed text-brand-700"
            : "text-[11px] font-bold uppercase tracking-[0.18em] text-brand-700"
        }
      >
        {eyebrow}
      </p>
      <h2 className="mt-3 font-display text-display-lg text-ink">{title}</h2>
      {children && <p className="mt-4 text-[17px] leading-relaxed text-ink-muted">{children}</p>}
    </div>
  );
}

/**
 * The dashboard, shown rather than described.
 *
 * This is a real composition of the same tokens the app uses, not a screenshot
 * — so it cannot drift out of date the way a PNG would.
 */
function ProductShot() {
  return (
    <section id="how" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <SectionHead eyebrow="The queue that matters" title="The screen your staff open first.">
          Everything the AI could not decide alone lands here. A doctor going unavailable, a call it
          escalated, a booking made off speech it could not hear well.
        </SectionHead>

        <div className="mt-12 overflow-hidden rounded-3xl border border-line bg-surface-raised shadow-lift">
          <div className="flex items-center gap-2 border-b border-line bg-surface-sunken px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-accent-rose/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent-amber/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-500/60" />
            <span className="ml-3 text-xs font-medium text-ink-subtle">
              Action Required · Sri Sai Clinic
            </span>
          </div>

          <div className="space-y-3 p-4 sm:p-6">
            <QueueCard
              severity="urgent"
              type="Reschedule needed"
              title="Dr Anitha is unavailable tomorrow morning"
              body="Called to the district hospital, 9:00 AM – 1:00 PM. 2 appointments are affected. Nothing has been cancelled and no patient has been messaged."
              cta="Review 2"
            />
            <QueueCard
              severity="high"
              type="Verify booking"
              title="Booking made from poorly-heard speech"
              body="Speech confidence averaged 0.61 on this call. The number may be wrong — worth a confirmation call before the appointment."
              cta="Open call"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function QueueCard({
  severity,
  type,
  title,
  body,
  cta,
}: {
  severity: "urgent" | "high";
  type: string;
  title: string;
  body: string;
  cta: string;
}) {
  const urgent = severity === "urgent";
  return (
    <article
      className={[
        "rounded-2xl border bg-surface-raised p-4 sm:p-5",
        urgent ? "border-accent-rose/30 bg-accent-rose/[0.04]" : "border-line",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                urgent
                  ? "bg-accent-rose/12 text-accent-rose"
                  : "bg-accent-amber/12 text-accent-amber",
              ].join(" ")}
            >
              {urgent ? "Urgent" : "High"}
            </span>
            <span className="text-xs font-medium text-ink-subtle">{type}</span>
          </div>
          <h3 className="mt-2.5 font-display text-[17px] font-semibold tracking-tight text-ink">
            {title}
          </h3>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{body}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-[13px] font-semibold text-white">
            {cta}
            <Icon name="arrowRight" className="h-3.5 w-3.5" />
          </span>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium text-ink-muted">
            <Icon name="check" className="h-3.5 w-3.5" />
            Done
          </span>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* How it works                                                                */
/* -------------------------------------------------------------------------- */

function HowItWorks() {
  const steps = [
    {
      icon: "calls" as const,
      title: "It answers",
      body: "Every call, including 9 PM on a Sunday — which is exactly when a worried parent rings and nobody is at the desk.",
    },
    {
      icon: "appointments" as const,
      title: "It books off your live schedule",
      body: "Every slot is re-checked against the real diary at the moment of booking. Double-booking is impossible, not unlikely.",
    },
    {
      icon: "actions" as const,
      title: "It hands you anything doubtful",
      body: "No silent cancellations, no guessing. Whatever needs a person lands in one queue with the context already gathered.",
    },
  ];
  return (
    <section className="border-b border-line bg-surface-sunken">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <SectionHead center eyebrow="How it works" title="Three things, done properly." />
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="rounded-2xl border border-line bg-surface-raised p-6 shadow-card"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/12 text-brand-700">
                  <Icon name={s.icon} className="h-5 w-5" />
                </span>
                <span className="font-display text-sm font-bold text-ink-subtle">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold tracking-tight text-ink">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Telugu                                                                      */
/* -------------------------------------------------------------------------- */

function TeluguSection() {
  return (
    <section id="telugu" className="border-b border-line">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHead eyebrow="తెలుగు" eyebrowLang="te" title="Telugu, properly.">
            Not Hindi with a Telugu label, and not a translation layer bolted onto an English bot.
            It follows code-switching mid-sentence, the way people here actually speak.
          </SectionHead>

          <ul className="mt-8 space-y-4">
            {[
              ["Code-switching", "“Doctor గారు available ఉన్నారా?” is one sentence, not two languages."],
              ["Names and numbers", "Telugu names and Indian phone numbers, heard correctly — and flagged when they are not."],
              ["Patient-facing too", "Every message, reminder and record a patient sees exists in both languages."],
            ].map(([t, b]) => (
              <li key={t} className="flex gap-3.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500/12 text-brand-700">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{t}</span>
                  <span className="block text-sm leading-relaxed text-ink-muted">{b}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-3xl border border-line bg-surface-raised p-6 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-subtle">
            A real turn
          </p>
          <div className="mt-5 space-y-4">
            <div>
              <p lang="te" className="text-[17px] leading-[1.75] text-ink">
                మా అబ్బాయికి దగ్గు ఉంది, డాక్టర్ రమేష్ గారిని ఎప్పుడు కలవచ్చు?
              </p>
              <p className="mt-1.5 text-[13px] italic text-ink-subtle">
                “My son has a cough — when can we see Dr Ramesh?”
              </p>
            </div>
            <div className="rounded-2xl bg-brand-500/10 p-4">
              <p lang="te" className="text-[17px] leading-[1.75] text-ink">
                రేపు ఉదయం 11:00కి ఖాళీ ఉంది. పిల్లల వయస్సు ఎంత?
              </p>
              <p className="mt-1.5 text-[13px] italic text-ink-muted">
                “Tomorrow 11:00 AM is free. How old is the child?”
              </p>
            </div>
          </div>
          <p className="mt-5 border-t border-line pt-4 text-[13px] text-ink-subtle">
            Paediatric age changes the slot length. It asks rather than assuming.
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Safety                                                                      */
/* -------------------------------------------------------------------------- */

function SafetyPromise() {
  return (
    <section className="border-b border-line bg-surface-inverse">
      <div className="mx-auto max-w-3xl px-5 py-20 text-center">
        <span className="inline-grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/15 text-brand-400">
          <Icon name="shield" className="h-6 w-6" />
        </span>
        <h2 className="mt-6 font-display text-display-lg text-ink-inverse">
          It never cancels a patient quietly.
        </h2>
        <p className="mt-5 text-[17px] leading-relaxed text-ink-inverse/75">
          A wrong restaurant booking is an annoyance. A wrong medical appointment is a patient who
          turns up to a closed door. So SAHVA never guesses: when a doctor becomes unavailable,
          every affected patient lands in an <strong className="text-ink-inverse">Action Required</strong>{" "}
          queue for a human to handle. Nothing is cancelled silently, and no message goes out until
          someone presses send.
        </p>
        <p className="mt-6 text-sm text-ink-inverse/55">
          Enforced by the database, not by a checkbox in the app.
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Pricing                                                                     */
/* -------------------------------------------------------------------------- */

function Pricing() {
  const plans = [
    {
      name: "Starter",
      price: "₹999",
      note: "300 call minutes included",
      doctors: "1 doctor",
      features: ["AI receptionist, 24/7", "WhatsApp confirmations", "Staff dashboard"],
      featured: false,
    },
    {
      name: "Growth",
      price: "₹2,499",
      note: "1,000 call minutes included",
      doctors: "Up to 4 doctors",
      features: [
        "Everything in Starter",
        "Analytics and call review",
        "Care loops and reminders",
        "Patient medical records",
      ],
      featured: true,
    },
    {
      name: "Multi-branch",
      price: "Let's talk",
      note: "Billed per location",
      doctors: "Unlimited",
      features: ["Multiple locations", "EHR integration", "Custom onboarding"],
      featured: false,
    },
  ];

  return (
    <section id="pricing" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <SectionHead center eyebrow="Pricing" title="One monthly price. No per-call surprises.">
          Overage is billed per minute and shown in the dashboard before it is charged.
        </SectionHead>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={[
                "relative flex flex-col rounded-3xl border p-7",
                p.featured
                  ? "border-brand-600/40 bg-brand-500/[0.06] shadow-lift"
                  : "border-line bg-surface-raised shadow-card",
              ].join(" ")}
            >
              {p.featured && (
                <span className="absolute -top-3 left-7 rounded-full bg-brand-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                  Most clinics
                </span>
              )}
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">{p.name}</h3>
              <p className="mt-4 font-display text-display-md text-ink">
                {p.price}
                {p.price.startsWith("₹") && (
                  <span className="ml-1 text-sm font-medium text-ink-subtle">/month</span>
                )}
              </p>
              <p className="mt-1.5 text-sm text-ink-muted">{p.note}</p>
              <p className="mt-0.5 text-sm text-ink-subtle">{p.doctors}</p>

              <ul className="mt-6 flex-1 space-y-2.5 border-t border-line pt-6">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm text-ink-muted">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href="tel:+918702345678"
                className={[
                  "mt-7 inline-flex h-11 items-center justify-center rounded-xl text-[15px] font-semibold transition active:scale-[.98]",
                  p.featured
                    ? "bg-brand-600 text-white shadow-glow hover:bg-brand-700"
                    : "border border-line-strong bg-surface-raised text-ink hover:border-ink/25",
                ].join(" ")}
              >
                Talk to us
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Economics — for the other reader                                            */
/* -------------------------------------------------------------------------- */

function Economics() {
  const rows = [
    ["Text-to-speech", "₹1.41", "39%"],
    ["Speech-to-text", "₹1.20", "33%"],
    ["Telephony", "₹0.90", "25%"],
    ["Language model", "₹0.08", "2%"],
  ];
  return (
    <section className="border-b border-line bg-surface-sunken">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHead eyebrow="The economics" title="₹3.59 a call, measured.">
            Not modelled — measured against vendor rates on real call traffic, and visible per call
            in the dashboard. At 100 calls a month on the ₹999 plan, gross margin is about 64%.
          </SectionHead>
          <p className="mt-6 text-sm leading-relaxed text-ink-subtle">
            Worth knowing which way the costs point: speech synthesis is the largest line, not the
            language model. Cutting LLM spend would save two paise a call.
          </p>
        </div>

        <div className="rounded-3xl border border-line bg-surface-raised p-6 shadow-card sm:p-7">
          <table className="w-full text-sm">
            <caption className="sr-only">Cost breakdown per call</caption>
            <tbody>
              {rows.map(([label, cost, share]) => (
                <tr key={label} className="border-b border-line last:border-0">
                  <th scope="row" className="py-3 text-left font-medium text-ink">
                    {label}
                  </th>
                  <td className="py-3 text-right font-display font-semibold text-ink">{cost}</td>
                  <td className="w-14 py-3 text-right text-ink-subtle">{share}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-strong">
                <th scope="row" className="pt-4 text-left font-semibold text-ink">
                  Per call
                </th>
                <td className="pt-4 text-right font-display text-lg font-bold text-brand-700">
                  ₹3.59
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* FAQ                                                                         */
/* -------------------------------------------------------------------------- */

function Faq() {
  const qs = [
    [
      "What happens if it mishears someone?",
      "The call is flagged with its speech-confidence score and the booking lands in the Action Required queue for someone to confirm. It does not quietly proceed.",
    ],
    [
      "Can it cancel appointments on its own?",
      "No, and that is off by default in settings. It can book and reschedule. Cancellation always needs a person.",
    ],
    [
      "Where is patient data stored?",
      "In an Indian region (Mumbai). Every table is row-level isolated per clinic, enforced in the database rather than the application.",
    ],
    [
      "What if two patients share one phone number?",
      "Common in paediatrics, and handled: identity is phone plus name, so a mother and child on one handset stay separate records.",
    ],
  ];
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-3xl px-5 py-20">
        <SectionHead center eyebrow="Questions" title="The ones clinic owners ask." />
        <dl className="mt-12 divide-y divide-line border-y border-line">
          {qs.map(([q, a]) => (
            <div key={q} className="py-6">
              <dt className="font-display text-[17px] font-semibold tracking-tight text-ink">{q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Close                                                                       */
/* -------------------------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-3xl px-5 py-20 text-center">
        <h2 className="font-display text-display-lg text-ink">
          Ring it. That is the whole demo.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-ink-muted">
          Call the line and book yourself an appointment in Telugu or English. If it does not
          convince you in ninety seconds, nothing on this page will.
        </p>
        <a
          href="tel:+918702345678"
          className="mt-8 inline-flex h-14 items-center justify-center gap-2.5 rounded-xl bg-brand-600 px-7 text-base font-semibold text-white shadow-glow transition duration-200 ease-spring hover:bg-brand-700 active:scale-[.98]"
        >
          <Icon name="calls" className="h-5 w-5" />
          +91 87023 45678
        </a>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-ink-subtle">
            Built for clinics in Warangal, Karimnagar and everywhere the metro SaaS never visits.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <Link
            href="/signin?mode=signup"
            className="text-sm font-medium text-ink-muted transition hover:text-ink"
          >
            Create an account
          </Link>
          <Link
            href="/signin"
            className="text-sm font-medium text-brand-700 transition hover:text-brand-600"
          >
            Sign in →
          </Link>
        </div>
      </div>
    </footer>
  );
}
