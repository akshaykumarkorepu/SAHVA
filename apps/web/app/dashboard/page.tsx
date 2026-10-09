"use client";

import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { AnalyticsSummary, TodayAppointment } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  Section,
  Skeleton,
  cn,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { CallVolumeChart } from "@/components/dashboard/CallVolumeChart";
import { appointmentStatus, formatPhone, formatTime } from "@/lib/format";

export default function OverviewPage() {
  const { clinic } = useSession();
  const tz = clinic?.timezone;
  const summary = useApi<AnalyticsSummary>("/analytics/summary?days=7");
  const today = useApi<TodayAppointment[]>("/appointments/today");

  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;

  const s = summary.data;
  const t = s?.totals;
  const actions = s?.open_action_items;

  return (
    <>
      <PageHeader
        eyebrow="Last 7 days"
        title="Overview"
        subtitle="How the AI receptionist has been handling your phone."
      />

      {/* The queue first: it is the only thing here that needs a person. */}
      {actions && actions.total > 0 && <ActionBanner total={actions.total} urgent={actions.urgent} high={actions.high} />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[124px]" />)
        ) : (
          <>
            <KpiCard label="Calls answered" value={t?.calls ?? 0} sub="Last 7 days" icon="calls" delay={0} />
            <KpiCard
              label="Bookings made"
              value={t?.bookings ?? 0}
              sub={`${t?.conversion_rate ?? 0}% of calls converted`}
              icon="appointments"
              tone="brand"
              delay={60}
            />
            <KpiCard
              label="Missed calls recovered"
              value={t?.recovered_missed ?? 0}
              sub="Would have gone unanswered"
              icon="sparkles"
              tone="brand"
              delay={120}
            />
            <KpiCard
              label="Cost per call"
              value={`₹${(s?.cost.per_call_inr ?? 0).toFixed(2)}`}
              sub={`₹${(s?.cost.total_inr ?? 0).toFixed(0)} this week`}
              icon="rupee"
              delay={180}
            />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">Call volume</h3>
              <p className="mt-0.5 text-xs text-ink-subtle">Total calls against successful bookings</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <Legend colour="bg-brand-600" label="Calls" />
              <Legend colour="bg-accent-sky" label="Bookings" />
            </div>
          </div>
          {summary.loading ? <Skeleton className="h-56" /> : <CallVolumeChart data={s?.daily ?? []} />}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-ink">Language mix</h3>
          <p className="mt-0.5 text-xs text-ink-subtle">Which language callers used</p>
          <LanguageSplit te={t?.telugu_calls ?? 0} en={t?.english_calls ?? 0} />

          <dl className="mt-6 space-y-3 border-t border-line pt-4 text-sm">
            <Stat label="Rescheduled" value={t?.reschedules ?? 0} />
            <Stat label="Escalated to staff" value={t?.escalations ?? 0} />
          </dl>
        </Card>
      </div>

      <Section
        className="mt-6"
        title="Today's appointments"
        action={
          <Link
            href="/dashboard/appointments"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 transition hover:text-brand-700"
          >
            View diary
            <Icon name="chevronRight" className="h-3.5 w-3.5" />
          </Link>
        }
      >
        {today.loading ? (
          <LoadingRows rows={3} />
        ) : today.error ? (
          <ErrorState error={today.error} onRetry={today.reload} />
        ) : (today.data ?? []).length === 0 ? (
          <EmptyState icon="appointments" title="Nothing booked for today" body="Appointments booked by the AI appear here automatically." />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {(today.data ?? []).map((a, i) => {
              const st = appointmentStatus(a.status!);
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-sunken/60 animate-fade-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <span className="w-[68px] shrink-0 font-display text-sm font-semibold tabular-nums text-ink">
                    {a.starts_at ? formatTime(a.starts_at, tz) : "—"}
                  </span>
                  <span
                    aria-hidden
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ background: a.colour_hex ?? "rgb(5 150 105)" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{a.patient_name}</p>
                    <p className="truncate text-xs text-ink-subtle">
                      {a.doctor_name} · {formatPhone(a.phone_e164)}
                    </p>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
              );
            })}
          </Card>
        )}
      </Section>
    </>
  );
}

function ActionBanner({ total, urgent, high }: { total: number; urgent: number; high: number }) {
  return (
    <Link href="/dashboard/actions" className="mb-4 block animate-fade-up">
      <div className="group relative overflow-hidden rounded-2xl border border-accent-rose/25 bg-accent-rose/[0.07] p-5 transition duration-200 ease-spring hover:-translate-y-0.5 hover:shadow-lift">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-rose text-white">
              <Icon name="actions" className="h-5 w-5" />
              <span className="absolute inset-0 animate-pulse-ring rounded-2xl bg-accent-rose/50" aria-hidden />
            </span>
            <div>
              <p className="font-display text-base font-semibold tracking-tight text-ink">
                {total} item{total === 1 ? "" : "s"} need a person
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {urgent > 0 && `${urgent} urgent · `}
                {high > 0 && `${high} high priority · `}
                Patients are waiting on these.
              </p>
            </div>
          </div>
          <Button iconRight="arrowRight" className="shrink-0">
            Review queue
          </Button>
        </div>
      </div>
    </Link>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-ink-subtle">
      <span className={cn("h-2 w-2 rounded-full", colour)} aria-hidden />
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function LanguageSplit({ te, en }: { te: number; en: number }) {
  const total = te + en;
  if (total === 0) return <p className="mt-4 text-sm text-ink-subtle">No calls yet.</p>;
  const tePct = Math.round((te / total) * 100);

  return (
    <div className="mt-5">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className="bg-brand-600 transition-all duration-700 ease-spring"
          style={{ width: `${tePct}%` }}
        />
        <div className="flex-1 bg-accent-sky transition-all duration-700 ease-spring" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
            <span className="h-2 w-2 rounded-full bg-brand-600" aria-hidden />
            Telugu
          </p>
          <p className="mt-1 font-display text-xl font-bold tabular-nums text-ink">{tePct}%</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
            <span className="h-2 w-2 rounded-full bg-accent-sky" aria-hidden />
            English
          </p>
          <p className="mt-1 font-display text-xl font-bold tabular-nums text-ink">{100 - tePct}%</p>
        </div>
      </div>
    </div>
  );
}
