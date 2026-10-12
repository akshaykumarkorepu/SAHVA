"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { cn } from "@/components/ui";
import { PRICE, inr, perMonthOnYearly, yearlySaving } from "@/lib/pricing";

const TRIAL_HREF = "/signin?mode=signup&role=staff";

/**
 * SAHVA Premium Homepage.
 *
 * A story-driven landing page that transforms a basic SaaS template into
 * a high-trust, cinematic healthcare experience.
 */

export default function HomePage() {
  return (
    <main className="min-h-[100dvh] bg-surface text-ink selection:bg-brand-500/20">
      <SiteHeader />
      <Hero />
      <ProblemSection />
      <HowItWorks />
      <BilingualSection />
      <SafetyPromise />
      <Pricing />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Components                                                                  */
/* -------------------------------------------------------------------------- */

function Wordmark({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5", className)}>
      <div className="relative h-8 w-8 shrink-0">
        <Image
          src="/brand/sahva-logo.png"
          alt="SAHVA Logo"
          fill
          className="object-contain"
          priority
        />
      </div>
      {!compact && (
        <div className="min-w-0">
          <span className="block font-display text-[16px] font-bold tracking-tight text-ink">SAHVA</span>
          <span className="block text-[11px] text-ink-subtle leading-none">AI receptionist</span>
        </div>
      )}
    </Link>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Wordmark />
        <nav className="hidden items-center gap-8 md:flex">
          {[
            ["How it works", "#how"],
            ["Telugu", "#telugu"],
            ["Pricing", "#pricing"],
            ["FAQ", "#faq"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-medium text-ink-muted transition hover:text-brand-600"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/signin" className="hidden h-10 items-center rounded-xl px-4 text-sm font-semibold text-ink-muted transition hover:text-ink sm:inline-flex">
            Sign in
          </Link>
          <Link
            href={TRIAL_HREF}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-on-brand shadow-glow transition duration-200 ease-spring hover:bg-brand-700 active:scale-[.98]"
          >
            Start free trial
            <Icon name="arrowRight" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden py-16 lg:py-28">
      {/* Ambient Backgrounds */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_30rem_at_10%_10%,rgb(var(--brand-500)/0.08),transparent_60%),radial-gradient(30rem_20rem_at_90%_80%,rgb(var(--accent-sky)/0.05),transparent_60%)]"
      />

      <div className="mx-auto grid max-w-6xl gap-16 px-5 lg:grid-cols-2 lg:items-center">
        <div className="animate-fade-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-600/20 bg-brand-500/10 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-brand-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-600" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
            </span>
            Bilingual 24/7 Receptionist
          </div>

          <h1 className="mt-6 font-display text-display-xl leading-[1.05] text-ink">
            Your clinic&rsquo;s phone,
            <br />
            <span className="text-brand-600">always answered.</span>
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-muted">
            Stop losing patients to missed calls. SAHVA answers every ring in Telugu and English,
            handling everything from simple queries to real appointment bookings against your live schedule.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link
              href={TRIAL_HREF}
              className="inline-flex h-14 items-center justify-center gap-3 rounded-2xl bg-brand-600 px-8 text-lg font-semibold text-on-brand shadow-glow transition duration-200 ease-spring hover:bg-brand-700 active:scale-[.98]"
            >
              Start {PRICE.trialDays}-day free trial
              <Icon name="arrowRight" className="h-5 w-5" />
            </Link>
            <a
              href="#pricing"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-line-strong bg-surface-raised px-8 text-lg font-semibold text-ink transition hover:bg-surface-sunken active:scale-[.98]"
            >
              See pricing
            </a>
          </div>
          <p className="mt-4 text-sm text-ink-subtle">No card needed for the trial. {inr(PRICE.monthlyPaise)}/month after, or {inr(PRICE.yearlyPaise)}/year.</p>

          <div className="mt-12 grid grid-cols-3 gap-8 border-t border-line pt-8">
            {[
              ["24/7", "Always picks up"],
              ["2", "Languages, mid-sentence"],
              ["0", "Double bookings"],
            ].map(([stat, label]) => (
              <div key={label}>
                <dt className="font-display text-stat text-ink">{stat}</dt>
                <dd className="mt-1 text-xs font-medium uppercase tracking-wider text-ink-subtle">{label}</dd>
              </div>
            ))}
          </div>
        </div>

        <div className="relative animate-fade-up" style={{ animationDelay: "200ms" }}>
          <div className="absolute -inset-4 rounded-[40px] bg-gradient-to-tr from-brand-500/10 to-accent-sky/10 blur-3xl" aria-hidden />
          <CallDemo />
        </div>
      </div>
    </section>
  );
}

/** Scripted, not live — the landing page never touches the API. */
const CONVERSATION = [
  { side: "left" as const, text: "నమస్తే, శ్రీ సాయి క్లినిక్. నేను మాయ. మీకు ఎలా సహాయం చేయగలను?", lang: "te", delay: 2000 },
  { side: "right" as const, text: "డాక్టర్ అనిత గారిని కలవాలి", lang: "te", delay: 2000 },
  { side: "left" as const, text: "రేపు ఉదయం 10:00 లేదా 10:30 ఖాళీ ఉంది. ఏది అనుకూలం?", lang: "te", delay: 2000 },
  { side: "right" as const, text: "10 o'clock fine. Ravi Kumar, 98765 43210", lang: "en", delay: 2000 },
];

// Fixed rather than random: Math.random() in render differs between server
// and client and breaks hydration.
const WAVE_HEIGHTS = [45, 80, 60, 95, 50];

function CallDemo() {
  const [step, setStep] = React.useState(0);
  const [isSpeaking, setIsSpeaking] = React.useState(false);

  React.useEffect(() => {
    if (step >= CONVERSATION.length) {
      const timer = setTimeout(() => setStep(0), 5000);
      return () => clearTimeout(timer);
    }

    setIsSpeaking(CONVERSATION[step].side === "left");
    const timer = setTimeout(() => {
      setStep(s => s + 1);
    }, CONVERSATION[step].delay);

    return () => clearTimeout(timer);
  }, [step]);

  return (
    <div className="relative rounded-3xl border border-line bg-surface-raised p-5 shadow-lift ring-1 ring-brand-500/10">
      <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-600" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">Live Demo · 9:42 PM</span>
        </div>
        <span className="rounded-full bg-accent-amber/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent-amber ring-1 ring-inset ring-accent-amber/20">
          After Hours
        </span>
      </div>

      <div className="space-y-4 min-h-[300px] flex flex-col justify-end">
        {CONVERSATION.slice(0, step).map((msg, i) => (
          <Bubble key={i} side={msg.side} lang={msg.lang} text={msg.text} />
        ))}

        {isSpeaking && step < CONVERSATION.length && (
          <div className="flex justify-start items-center gap-3 animate-fade-in">
            <div className="flex items-end gap-1 h-4">
              {WAVE_HEIGHTS.map((h, i) => (
                <span
                  key={i}
                  className="w-0.5 bg-brand-500 rounded-full animate-wave"
                  style={{ animationDelay: `${i * 0.1}s`, height: `${h}%` }}
                />
              ))}
            </div>
            <span className="text-xs italic text-ink-subtle animate-pulse">Maya is speaking...</span>
          </div>
        )}
      </div>

      {step === CONVERSATION.length && (
        <div className="mt-6 animate-scale-in flex items-center gap-3 rounded-2xl border border-brand-600/20 bg-brand-500/10 p-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-on-brand">
            <Icon name="check" className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-700">Appointment Booked</span>
            <span className="block text-sm font-semibold text-ink">Dr Anitha · tomorrow, 10:00 AM</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ side, lang, text }: { side: "left" | "right"; lang?: string; text: string }) {
  const isRight = side === "right";
  return (
    <div className={cn("flex", isRight ? "justify-end" : "justify-start")}>
      <p
        lang={lang}
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed animate-fade-up",
          lang === "te" ? "text-base leading-relaxed" : "",
          isRight
            ? "rounded-br-sm bg-brand-600 text-on-brand font-medium"
            : "rounded-bl-sm bg-surface-sunken text-ink"
        )}
      >
        {text}
      </p>
    </div>
  );
}

function ProblemSection() {
  return (
    <section className="bg-surface-sunken py-24 border-y border-line">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="font-display text-display-lg text-ink">The cost of silence.</h2>
          <p className="mt-4 text-lg text-ink-muted">A missed call isn’t just a notification—it’s a patient moving to the next clinic on their list.</p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {[
            ["9 PM", "when patients actually call", "and nobody is at the desk"],
            ["0", "double bookings", "the diary itself refuses them"],
            [`${PRICE.trialDays} days`, "free to try", "no card, cancel any time"],
          ].map(([stat, label, note]) => (
            <div key={label} className="flex flex-col items-center text-center p-8 rounded-3xl bg-surface-raised border border-line shadow-card animate-fade-up">
              <span className="font-display text-stat text-brand-600">{stat}</span>
              <p className="mt-3 text-base font-semibold text-ink">{label}</p>
              <p className="mt-2 text-xs text-ink-subtle">{note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: "calls" as const,
      title: "It answers",
      body: "Every call, including 9 PM on a Sunday—exactly when a worried parent rings and the desk is empty.",
    },
    {
      icon: "appointments" as const,
      title: "It books live",
      body: "Slots are checked against your real diary in real-time. Double-booking is impossible, not unlikely.",
    },
    {
      icon: "actions" as const,
      title: "It flags doubts",
      body: "No silent cancellations. Whatever needs a human lands in one queue with all the context gathered.",
    },
  ];
  return (
    <section id="how" className="py-24 border-b border-line">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center max-w-2xl mx-auto mb-20">
          <span className="text-[12px] font-bold uppercase tracking-widest text-brand-700">The Process</span>
          <h2 className="mt-3 font-display text-display-lg text-ink">Three things, done properly.</h2>
        </div>
        <div className="grid gap-12 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="relative p-8 rounded-3xl border border-line bg-surface-raised shadow-card animate-fade-up" style={{ animationDelay: `${i * 150}ms` }}>
              <div className="flex items-center gap-4 mb-6">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-700">
                  <Icon name={s.icon} className="h-6 w-6" />
                </span>
                <span className="font-display text-xl font-bold text-ink-subtle">0{i + 1}</span>
              </div>
              <h3 className="font-display text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BilingualSection() {
  return (
    <section id="telugu" className="py-24 bg-surface-sunken/50 border-b border-line">
      <div className="mx-auto max-w-6xl px-5 grid lg:grid-cols-2 gap-16 items-center">
        <div className="animate-fade-up">
          <span className="text-[12px] font-bold uppercase tracking-widest text-brand-700">Language Mastery</span>
          <h2 className="mt-3 font-display text-display-lg text-ink">Telugu, properly.</h2>
          <p className="mt-6 text-lg leading-relaxed text-ink-muted">
            Not a translation layer bolted onto an English bot. SAHVA follows code-switching
            mid-sentence—the way people actually speak in Telangana.
          </p>
          <ul className="mt-10 space-y-6">
            {[
              ["Code-switching", "“Doctor గారు available ఉన్నారా?” is one sentence, not two languages."],
              ["Local Context", "Telugu names and Indian phone numbers, heard correctly and verified."],
              ["Patient-facing", "Every reminder and record exists in both languages."],
            ].map(([t, b]) => (
              <li key={t} className="flex gap-4">
                <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-700">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
                <div>
                  <span className="block text-sm font-semibold text-ink">{t}</span>
                  <span className="block text-sm text-ink-muted">{b}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative animate-fade-up" style={{ animationDelay: "200ms" }}>
          <div className="absolute -inset-4 rounded-[40px] bg-brand-500/5 blur-2xl" aria-hidden />
          <div className="relative rounded-3xl border border-line bg-surface-raised p-8 shadow-lift">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-subtle mb-6">Real Turn Example</p>
            <div className="space-y-6">
              <div className="group">
                <p lang="te" className="text-lg leading-relaxed text-ink transition group-hover:text-brand-600">
                  మా అబ్బాయికి దగ్గు ఉంది, డాక్టర్ రమేష్ గారిని ఎప్పుడు కలవచ్చు?
                </p>
                <p className="mt-2 text-xs italic text-ink-subtle">“My son has a cough — when can we see Dr Ramesh?”</p>
              </div>
              <div className="rounded-2xl bg-brand-500/10 p-5 border-l-4 border-brand-600">
                <p lang="te" className="text-lg leading-relaxed text-ink">
                  రేపు ఉదయం 11:00కి ఖాళీ ఉంది. పిల్లల వయస్సు ఎంత?
                </p>
                <p className="mt-2 text-xs italic text-ink-muted">“Tomorrow 11:00 AM is free. How old is the child?”</p>
              </div>
            </div>
            <p className="mt-8 border-t border-line pt-4 text-xs text-ink-subtle italic">
              Paediatric age changes the slot length. SAHVA asks rather than assuming.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SafetyPromise() {
  return (
    <section className="py-24 bg-surface-inverse text-ink-inverse overflow-hidden relative">
      <div className="absolute top-0 right-0 w-1/3 h-full bg-brand-600/10 blur-3xl rounded-full" aria-hidden />
      <div className="mx-auto max-w-3xl px-5 text-center relative z-10">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-500/20 text-brand-400 mb-8">
          <Icon name="shield" className="h-8 w-8" />
        </div>
        <h2 className="font-display text-display-lg leading-tight">
          It never cancels a patient quietly.
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-ink-inverse/70">
          A wrong medical appointment is a patient who turns up to a closed door.
          SAHVA never guesses: when a doctor becomes unavailable, every affected
          patient lands in an <strong className="text-white">Action Required</strong> queue.
        </p>
        <p className="mt-8 text-sm text-ink-inverse/40 uppercase tracking-widest font-semibold">
          Enforced by the database, not a checkbox.
        </p>
      </div>
    </section>
  );
}

function Pricing() {
  const [cycle, setCycle] = React.useState<"monthly" | "yearly">("yearly");
  const saving = yearlySaving();
  const features = [
    "AI receptionist in Telugu and English",
    "Bookings checked against your live diary",
    "Unlimited doctors and staff accounts",
    "Action Required queue — nothing cancelled silently",
    "Walk-in tokens and waiting-room screen",
    "WhatsApp appointment links for patients",
    "Patient records, prescriptions and printing",
    "Every read of a medical record audited",
  ];
  return (
    <section id="pricing" className="py-24 border-b border-line">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-[12px] font-bold uppercase tracking-widest text-brand-700">Pricing</span>
          <h2 className="mt-3 font-display text-display-lg text-ink">One plan. Everything included.</h2>
          <p className="mt-4 text-lg text-ink-muted">
            Try it free for {PRICE.trialDays} days — no card. Then pay monthly, or yearly and save {saving.percent}%.
          </p>
        </div>

        <div className="mb-10 flex justify-center">
          <div role="tablist" aria-label="Billing period" className="inline-flex rounded-2xl border border-line bg-surface-sunken p-1">
            {(["monthly", "yearly"] as const).map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={cycle === c}
                onClick={() => setCycle(c)}
                className={cn(
                  "rounded-xl px-5 py-2 text-sm font-semibold transition",
                  cycle === c ? "bg-surface-raised text-ink shadow-xs" : "text-ink-muted hover:text-ink",
                )}
              >
                {c === "monthly" ? "Monthly" : "Yearly"}
                {c === "yearly" && (
                  <span className="ml-2 rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] text-brand-700">
                    Save {saving.percent}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div className="relative flex flex-col rounded-3xl border border-brand-600 bg-surface-raised p-8 shadow-lift ring-1 ring-brand-600/20">
            <h3 className="font-display text-lg font-semibold text-ink">SAHVA for Clinics</h3>
            <div className="mt-4 flex items-baseline gap-2" aria-live="polite">
              <span className="font-display text-display-lg text-ink">
                {inr(cycle === "monthly" ? PRICE.monthlyPaise : PRICE.yearlyPaise)}
              </span>
              <span className="text-sm font-medium text-ink-subtle">/{cycle === "monthly" ? "month" : "year"}</span>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              {cycle === "yearly"
                ? `${inr(perMonthOnYearly())} a month, billed once a year — ${inr(saving.paise)} less than monthly.`
                : "Billed every month. Switch to yearly any time."}
            </p>
            <Link
              href={TRIAL_HREF}
              className="mt-8 inline-flex h-12 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-on-brand shadow-glow transition hover:bg-brand-700 active:scale-[.98]"
            >
              Start {PRICE.trialDays}-day free trial
            </Link>
            <p className="mt-3 text-center text-xs text-ink-subtle">
              No card needed. Pay by UPI, card or netbanking through Razorpay when the trial ends.
            </p>
          </div>

          <ul className="space-y-4 self-center">
            {features.map((f) => (
              <li key={f} className="flex gap-3 text-[15px] text-ink">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-700">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const items: [string, string][] = [
    [
      "Do I need a card to start the trial?",
      `No. Sign up, set up your clinic and use everything for ${PRICE.trialDays} days. We ask for payment only when you choose a plan.`,
    ],
    [
      "What happens when the trial ends?",
      "You choose monthly or yearly and pay from the Billing page. If you pay during the trial, the paid period starts when the trial ends — you do not lose the days you have left.",
    ],
    [
      "How do I pay?",
      "Through Razorpay: UPI, debit and credit cards, and netbanking. Each payment covers one month or one year; nothing is debited automatically.",
    ],
    [
      "Can I cancel?",
      "Yes. Payments are for a period in advance and are not renewed automatically, so you simply do not pay for the next one. See the refund policy for refunds.",
    ],
    [
      "Who can see my patients' records?",
      "Only your clinic's staff, with each clinic's data walled off from every other at the database. Owners can see who opened a patient's medical record and when.",
    ],
    [
      "Does it work in Telugu?",
      "Yes — the AI receptionist, patient links and patient record all work in Telugu and English, and follow callers who mix the two.",
    ],
  ];
  return (
    <section id="faq" className="border-b border-line py-24">
      <div className="mx-auto max-w-3xl px-5">
        <h2 className="text-center font-display text-display-md text-ink">Questions clinics ask</h2>
        <div className="mt-10 divide-y divide-line rounded-3xl border border-line bg-surface-raised">
          {items.map(([q, a]) => (
            <details key={q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink">
                {q}
                <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-subtle transition group-open:rotate-90" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-brand-600/5" />
      <div className="mx-auto max-w-3xl px-5 text-center">
        <h2 className="font-display text-display-lg text-ink">Set it up this afternoon.</h2>
        <p className="mt-6 text-lg leading-relaxed text-ink-muted">
          Create your account, add your doctors and hours, and your clinic is running on SAHVA.
          {` ${PRICE.trialDays} days free, no card.`}
        </p>
        <Link
          href={TRIAL_HREF}
          className="mt-10 inline-flex h-16 items-center justify-center gap-3 rounded-2xl bg-brand-600 px-10 text-xl font-bold text-on-brand shadow-glow transition duration-200 ease-spring hover:bg-brand-700 active:scale-[.98]"
        >
          Start your free trial
          <Icon name="arrowRight" className="h-6 w-6" />
        </Link>
      </div>
    </section>
  );
}

function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-surface-raised py-12">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:grid-cols-[1.5fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-xs text-xs leading-relaxed text-ink-subtle">
            Built for clinics in Warangal, Karimnagar and everywhere the metro SaaS never visits.
          </p>
        </div>
        <nav aria-label="Product" className="flex flex-col gap-2 text-sm">
          <span className="font-semibold text-ink">Product</span>
          <a href="#pricing" className="text-ink-muted hover:text-ink">Pricing</a>
          <Link href={TRIAL_HREF} className="text-ink-muted hover:text-ink">Start free trial</Link>
          <Link href="/signin" className="text-ink-muted hover:text-ink">Sign in</Link>
        </nav>
        <nav aria-label="Company" className="flex flex-col gap-2 text-sm">
          <span className="font-semibold text-ink">Company</span>
          <Link href="/contact" className="text-ink-muted hover:text-ink">Contact</Link>
          <Link href="/terms" className="text-ink-muted hover:text-ink">Terms</Link>
          <Link href="/privacy" className="text-ink-muted hover:text-ink">Privacy</Link>
          <Link href="/refund-policy" className="text-ink-muted hover:text-ink">Refunds &amp; cancellation</Link>
        </nav>
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-5 text-xs text-ink-subtle">© {year} SAHVA. Payments are processed by Razorpay.</p>
    </footer>
  );
}
