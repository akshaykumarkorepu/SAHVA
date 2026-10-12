"use client";

import * as React from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { ActionItem, AnalyticsSummary, TodayAppointment } from "@/lib/types";
import { Badge, Card, EmptyState, ErrorState, LoadingRows, PageHeader, Section, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icons";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TodayTimeline } from "@/components/dashboard/TodayTimeline";
import { AppointmentPanel } from "@/components/dashboard/AppointmentPanel";
import { formatDate, relativeTime, todayIso } from "@/lib/format";
import { countDay, topActions } from "@/lib/today";

/**
 * The Command Center.
 *
 * A clinic owner opens this to answer four questions in a few seconds:
 * what is happening today, what needs me, is SAHVA working, and are we
 * losing appointments. Trends live on Analytics; this page is about today.
 */
export default function OverviewPage() {
  const { clinic } = useSession();
  const tz = clinic?.timezone;
  const summary = useApi<AnalyticsSummary>("/analytics/summary?days=7");
  const today = useApi<TodayAppointment[]>("/appointments/today");
  const actions = useApi<ActionItem[]>("/actions");
  const now = useMinute();
  const [selected, setSelected] = React.useState<TodayAppointment | null>(null);

  const rows = today.data ?? [];
  const day = countDay(rows);
  const todayCalls = summary.data?.daily.find((d) => d.day === todayIso(tz));
  const open = actions.data ?? [];
  const urgent = open.filter((a) => a.severity === "urgent").length;

  return (
    <>
      <PageHeader
        eyebrow={formatDate(now.toISOString(), tz)}
        title="Today"
        subtitle={headline(day.total, open.length, today.loading || actions.loading)}
      />

      {/* 1 · Four numbers: today's load, the AI's work, its value, what's waiting.
          2×2 on a phone, so the day itself is still on the first screen. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {today.loading || summary.loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[124px]" />)
        ) : (
          <>
            <KpiCard
              label="Appointments today"
              value={day.total}
              sub={day.unconfirmed > 0 ? `${day.unconfirmed} not yet confirmed` : "None waiting on confirmation"}
              icon="appointments"
              tone={day.unconfirmed > 0 ? "warn" : "neutral"}
            />
            <KpiCard
              label="Calls handled by SAHVA"
              value={todayCalls?.total_calls ?? 0}
              sub={`${todayCalls?.escalations ?? 0} passed to staff today`}
              icon="calls"
              delay={60}
            />
            <KpiCard
              label="Booked from calls"
              value={todayCalls?.bookings ?? 0}
              sub={bookingRate(todayCalls?.bookings ?? 0, todayCalls?.total_calls ?? 0)}
              icon="sparkles"
              tone="brand"
              delay={120}
            />
            <Link href="/dashboard/actions" className="block rounded-2xl">
              <KpiCard
                label="Needs a person"
                value={open.length}
                sub={urgent > 0 ? `${urgent} urgent` : open.length > 0 ? "Nothing urgent" : "Queue is clear"}
                icon="actions"
                tone={urgent > 0 ? "bad" : open.length > 0 ? "warn" : "neutral"}
                delay={180}
              />
            </Link>
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* 2 · The day, in order. */}
        <Section
          title="Today's appointments"
          action={
            <Link
              href="/dashboard/appointments"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 transition hover:text-brand-800"
            >
              Open diary
              <Icon name="chevronRight" className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {today.loading ? (
            <LoadingRows rows={4} />
          ) : today.error ? (
            <ErrorState error={today.error} onRetry={today.reload} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="appointments"
              title="Nothing booked for today"
              body="Appointments appear here as they are booked — by the AI, at the desk, or online."
            />
          ) : (
            <TodayTimeline rows={rows} tz={tz} now={now} onSelect={setSelected} />
          )}
        </Section>

        <div className="space-y-6">
          {/* 3 · What needs a person. */}
          <Section
            title="Needs a person"
            action={
              open.length > 0 ? (
                <Link
                  href="/dashboard/actions"
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 transition hover:text-brand-800"
                >
                  All {open.length}
                  <Icon name="chevronRight" className="h-3.5 w-3.5" />
                </Link>
              ) : undefined
            }
          >
            {actions.loading ? (
              <LoadingRows rows={2} />
            ) : actions.error ? (
              <ErrorState error={actions.error} onRetry={actions.reload} />
            ) : open.length === 0 ? (
              <Card className="flex items-center gap-3 p-4">
                <Icon name="success" className="h-5 w-5 text-brand-600" />
                <p className="text-sm text-ink-muted">Nothing waiting. Everything the AI handled went through cleanly.</p>
              </Card>
            ) : (
              <Card className="divide-y divide-line overflow-hidden">
                {topActions(open).map((item) => (
                  <Link
                    key={item.id}
                    href="/dashboard/actions"
                    className="flex items-start gap-3 px-4 py-3 transition hover:bg-surface-sunken/60"
                  >
                    <SeverityDot severity={item.severity} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug text-ink">{item.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-subtle">
                        {item.created_at ? relativeTime(item.created_at) : ""}
                      </span>
                    </span>
                  </Link>
                ))}
              </Card>
            )}
          </Section>

          {/* 4 · Is SAHVA earning its keep — the week, in four lines. */}
          <Section
            title="This week"
            action={
              <Link
                href="/dashboard/analytics"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 transition hover:text-brand-800"
              >
                Analytics
                <Icon name="chevronRight" className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {summary.loading ? (
              <Skeleton className="h-40" />
            ) : summary.error ? (
              <ErrorState error={summary.error} onRetry={summary.reload} />
            ) : (
              <Card className="p-4">
                <dl className="space-y-3 text-sm">
                  <WeekStat label="Calls answered" value={summary.data?.totals.calls ?? 0} />
                  <WeekStat
                    label="Bookings made"
                    value={summary.data?.totals.bookings ?? 0}
                    note={`${summary.data?.totals.conversion_rate ?? 0}% of calls`}
                  />
                  <WeekStat
                    label="Missed calls recovered"
                    value={summary.data?.totals.recovered_missed ?? 0}
                    note="would have gone unanswered"
                  />
                  <WeekStat
                    label="Cost per call"
                    value={`₹${(summary.data?.cost.per_call_inr ?? 0).toFixed(2)}`}
                  />
                </dl>
              </Card>
            )}
          </Section>
        </div>
      </div>

      <AppointmentPanel appointment={selected} tz={tz} onClose={() => setSelected(null)} />
    </>
  );
}

function headline(total: number, open: number, loading: boolean): string {
  if (loading) return "Loading today…";
  const visits = total === 1 ? "1 appointment" : `${total} appointments`;
  if (open === 0) return `${visits}. Nothing needs a person right now.`;
  return `${visits}. ${open === 1 ? "1 thing needs" : `${open} things need`} a person.`;
}

/** Measured against today's calls, so it reads with the number above it. */
function bookingRate(bookings: number, calls: number): string {
  if (calls === 0) return "No calls yet today";
  return `${Math.round((bookings / calls) * 100)}% of today's calls`;
}

/** Re-renders once a minute so the now-line and relative times keep up. */
function useMinute(): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const SEVERITY_LABEL: Record<string, string> = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" };

function SeverityDot({ severity }: { severity: string | null }) {
  const tone =
    severity === "urgent" ? "bad" : severity === "high" ? "warn" : ("neutral" as const);
  return (
    <span className="mt-0.5 shrink-0">
      <Badge tone={tone}>{SEVERITY_LABEL[severity ?? "normal"] ?? "Normal"}</Badge>
    </span>
  );
}

function WeekStat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">
        {label}
        {note && <span className="block text-[11px] text-ink-subtle">{note}</span>}
      </dt>
      <dd className="font-display text-base font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
