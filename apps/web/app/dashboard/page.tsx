"use client";

import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { AnalyticsSummary, TodayAppointment } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner } from "@/components/ui";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { CallVolumeChart } from "@/components/dashboard/CallVolumeChart";
import { appointmentStatus, formatPhone, formatTime } from "@/lib/format";

export default function OverviewPage() {
  const { clinic } = useSession();
  const tz = clinic?.timezone;
  const summary = useApi<AnalyticsSummary>("/analytics/summary?days=7");
  const today = useApi<TodayAppointment[]>("/appointments/today");

  if (summary.loading) return <Spinner />;
  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;

  const s = summary.data;
  const t = s?.totals;
  const actions = s?.open_action_items;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="How the AI receptionist has performed over the last 7 days."
      />

      {/* The queue comes first: it is the only thing on this page that needs
          a person to do something. */}
      {actions && actions.total > 0 && (
        <Link href="/dashboard/actions" className="mb-6 block">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 transition hover:bg-rose-100">
            <div>
              <p className="text-sm font-semibold text-rose-900">
                {actions.total} item{actions.total === 1 ? "" : "s"} need a person
              </p>
              <p className="mt-0.5 text-sm text-rose-700">
                {actions.urgent > 0 && `${actions.urgent} urgent · `}
                {actions.high > 0 && `${actions.high} high priority · `}
                Patients are waiting on these.
              </p>
            </div>
            <Button>Review queue →</Button>
          </div>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Calls answered" value={t?.calls ?? 0} sub="Last 7 days" />
        <KpiCard
          label="Bookings made"
          value={t?.bookings ?? 0}
          sub={`${t?.conversion_rate ?? 0}% of calls`}
          tone="good"
        />
        <KpiCard
          label="Missed calls recovered"
          value={t?.recovered_missed ?? 0}
          sub="Would have gone unanswered"
          tone="good"
        />
        <KpiCard
          label="Cost per call"
          value={`₹${(s?.cost.per_call_inr ?? 0).toFixed(2)}`}
          sub={`₹${(s?.cost.total_inr ?? 0).toFixed(0)} total`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-ink-900">Call volume</h3>
          <p className="mb-3 text-xs text-ink-500">Total calls against successful bookings</p>
          <CallVolumeChart data={s?.daily ?? []} />
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-ink-900">Language mix</h3>
          <p className="mb-4 text-xs text-ink-500">Which language callers used</p>
          <LanguageBar te={t?.telugu_calls ?? 0} en={t?.english_calls ?? 0} />

          <dl className="mt-6 space-y-3 border-t border-ink-100 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Rescheduled</dt>
              <dd className="font-medium text-ink-900">{t?.reschedules ?? 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Escalated to staff</dt>
              <dd className="font-medium text-ink-900">{t?.escalations ?? 0}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-900">Today&rsquo;s appointments</h3>
          <Link href="/dashboard/appointments" className="text-sm font-medium text-primary-700">
            View all →
          </Link>
        </div>

        {today.loading ? (
          <Spinner />
        ) : today.error ? (
          <ErrorState error={today.error} onRetry={today.reload} />
        ) : (today.data ?? []).length === 0 ? (
          <EmptyState icon="▦" title="Nothing booked for today" />
        ) : (
          <Card className="divide-y divide-ink-100">
            {(today.data ?? []).map((a) => {
              const st = appointmentStatus(a.status!);
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="w-20 shrink-0 text-sm font-semibold text-ink-900">
                    {a.starts_at ? formatTime(a.starts_at, tz) : "—"}
                  </span>
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: a.colour_hex ?? "#059669" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{a.patient_name}</p>
                    <p className="truncate text-xs text-ink-500">
                      {a.doctor_name} · {formatPhone(a.phone_e164)}
                    </p>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </>
  );
}

function LanguageBar({ te, en }: { te: number; en: number }) {
  const total = te + en;
  if (total === 0) return <p className="text-sm text-ink-500">No calls yet.</p>;
  const tePct = Math.round((te / total) * 100);

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-100">
        <div className="bg-primary-600" style={{ width: `${tePct}%` }} />
        <div className="bg-accent-500" style={{ width: `${100 - tePct}%` }} />
      </div>
      <div className="mt-3 flex justify-between text-sm">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-2 w-2 rounded-full bg-primary-600" />
          <span className="text-ink-700">Telugu</span>
          <span className="font-medium text-ink-900">{tePct}%</span>
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-2 w-2 rounded-full bg-accent-500" />
          <span className="text-ink-700">English</span>
          <span className="font-medium text-ink-900">{100 - tePct}%</span>
        </span>
      </div>
    </div>
  );
}
