import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-lg font-bold text-white"
          >
            S
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight text-ink-900">SAHVA</p>
            <p className="text-xs text-ink-500">AI receptionist for clinics</p>
          </div>
        </div>
        <Link
          href="/login"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
        >
          Staff sign in
        </Link>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-20 pt-10 md:pt-20">
        <p className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
          Telugu &amp; English
        </p>
        <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-tight tracking-tight text-ink-900 md:text-5xl">
          Your clinic&rsquo;s phone, answered.
          <span className="block text-primary-700">Every call. Day or night.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-700 md:text-lg">
          SAHVA answers every inbound call in Telugu or English, books real appointments off live
          availability, and never lets a schedule change silently cancel a patient without your
          staff knowing.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-soft transition hover:bg-primary-700"
          >
            Staff sign in
          </Link>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Answers every call",
              body: "Including after hours, when a third of bookings are lost to an unanswered phone.",
            },
            {
              title: "Books off live availability",
              body: "Every slot is checked against the real schedule at the moment of booking. Double-booking is impossible, not unlikely.",
            },
            {
              title: "Never cancels quietly",
              body: "If a doctor becomes unavailable, affected patients are flagged for your staff to handle — never dropped.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-ink-100 p-5 shadow-card">
              <h3 className="text-sm font-semibold text-ink-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
