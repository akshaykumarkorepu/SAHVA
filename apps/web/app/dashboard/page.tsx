import { api } from "@/lib/api";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { WeeklyCallsChart } from "@/components/dashboard/WeeklyCallsChart";
import { LanguageSplitChart } from "@/components/dashboard/LanguageSplitChart";
import { CallsTable } from "@/components/dashboard/CallsTable";
import { Card, Badge } from "@/components/ui";
import { addDaysIso, formatTime, todayIso } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [analytics, calls, appts, calendar] = await Promise.all([
    api.analytics(),
    api.calls(6),
    api.appointments({ from: todayIso(), to: addDaysIso(todayIso(), 1) }),
    api.appointmentsCalendar(todayIso(), addDaysIso(todayIso(), 6)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink-900">Overview</h2>
        <p className="text-sm text-ink-500">How the AI receptionist is performing for {analytics.callsToday} calls today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Calls today"
          value={analytics.callsToday}
          hint="All inbound + AI-handled"
          icon="☎"
        />
        <KpiCard
          label="Bookings made"
          value={analytics.bookingsMade}
          hint="Booked + rescheduled today"
          icon="✓"
          tone="good"
        />
        <KpiCard
          label="Missed-call recovery"
          value={`${analytics.missedCallRecoveryRate}%`}
          hint={`${analytics.recovered} of ${analytics.flagged} previously-missed calls recovered`}
          icon="↻"
          tone="good"
        />
        <KpiCard
          label="Cancellations"
          value={analytics.cancellations}
          hint="Today"
          icon="✕"
          tone="warn"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <WeeklyCallsChart data={analytics.weekCalls} />
        </div>
        <LanguageSplitChart split={analytics.languageSplit} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-900">Recent calls</h3>
            <Link
              href="/dashboard/calls"
              className="text-xs font-medium text-primary-700 hover:underline"
            >
              View all →
            </Link>
          </div>
          <CallsTable calls={calls} dense />
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-900">Today&apos;s appointments</h3>
            <Link
              href="/dashboard/appointments"
              className="text-xs font-medium text-primary-700 hover:underline"
            >
              Calendar →
            </Link>
          </div>
          <Card>
            {appts.length === 0 ? (
              <div className="p-6 text-sm text-ink-500">No appointments today.</div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {appts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-ink-900">{a.patient_name}</div>
                      <div className="text-xs text-ink-500">{a.doctor_name} · {a.reason || "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-ink-900">{formatTime(a.starts_at)}</div>
                      {a.status !== "booked" && <Badge tone="warn">{a.status}</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
