import Link from "next/link";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const clinic = await api.clinic().catch(() => null);
  const name = clinic?.name || "Sri Sai Clinic";

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-primary-50/40 to-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white">
              <span className="text-lg">🩺</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">ClinicVoice AI</div>
              <div className="text-[11px] text-ink-500">For {name}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-ink-700 hover:text-primary-700"
            >
              Dashboard
            </Link>
            <Link
              href="/call"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-primary-700"
            >
              Start demo call
            </Link>
          </div>
        </nav>

        <section className="mt-16 grid items-center gap-12 md:mt-24 md:grid-cols-2">
          <div>
            <Badge tone="good">● Live demo</Badge>
            <h1 className="mt-4 text-4xl font-bold leading-tight text-ink-900 md:text-5xl">
              Your clinic&apos;s AI receptionist. <span className="text-primary-700">English &amp; Telugu.</span>
            </h1>
            <p className="mt-5 text-lg text-ink-700">
              ClinicVoice answers every inbound call, books or reschedules appointments, and
              sends a WhatsApp confirmation — even after hours.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/call"
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-3 text-base font-semibold text-white shadow-soft hover:bg-primary-700"
              >
                🎙 Start a demo call
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg border border-ink-300 bg-white px-5 py-3 text-base font-semibold text-ink-700 hover:bg-ink-100"
              >
                View dashboard →
              </Link>
            </div>
            <p className="mt-4 text-xs text-ink-500">
              No phone integration. The demo uses your browser&apos;s microphone. Plug in
              Twilio/Exotel later to take real calls.
            </p>
          </div>

          <Card className="relative overflow-hidden p-0 shadow-soft">
            <div className="border-b border-ink-100 bg-ink-100/40 px-4 py-3 text-xs font-medium text-ink-500">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-400" />
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-400" />
              <span className="mr-3 inline-block h-2 w-2 rounded-full bg-primary-400" />
              Live call · Sri Sai Clinic
            </div>
            <div className="space-y-3 p-5">
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl bg-ink-100 px-4 py-2 text-sm text-ink-900">
                  నమస్తే, శ్రీ సాయి క్లినిక్. నేను మాయా. మీకు ఎలా సహాయం చేయగలను?
                </div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl bg-primary-600 px-4 py-2 text-sm text-white">
                  నాకు డాక్టర్ అనిత రెడ్డి గారిని కలవాలి
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl bg-ink-100 px-4 py-2 text-sm text-ink-900">
                  తప్పకుండా. మీ పేరు మరియు ఫోన్ నంబర్ చెప్పగలరా?
                </div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl bg-primary-600 px-4 py-2 text-sm text-white">
                  రవి కుమార్, 9876543210
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl bg-ink-100 px-4 py-2 text-sm text-ink-900">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                    ✓ Appointment booked
                  </div>
                  <div className="mt-1">Dr. Anitha Reddy · tomorrow 10:00 AM</div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { title: "Answers every call", body: "AI picks up in under 2 seconds, in English or Telugu. No more missed calls." },
            { title: "Books, reschedules, cancels", body: "Real-time availability, real appointments in your calendar. Confirmation via WhatsApp." },
            { title: "Works after hours", body: "Patients book at 11pm. The dashboard surfaces every call the next morning." },
          ].map((f) => (
            <Card key={f.title} className="p-6">
              <div className="text-2xl">✦</div>
              <h3 className="mt-2 text-base font-semibold text-ink-900">{f.title}</h3>
              <p className="mt-1 text-sm text-ink-700">{f.body}</p>
            </Card>
          ))}
        </section>

        <footer className="mt-24 border-t border-ink-100 pt-6 text-xs text-ink-500">
          Built for {name}. © {new Date().getFullYear()} ClinicVoice AI — demo.
        </footer>
      </div>
    </main>
  );
}
