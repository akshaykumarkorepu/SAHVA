import { api } from "@/lib/api";
import { Card } from "@/components/ui";
import { WeeklyCallsChart } from "@/components/dashboard/WeeklyCallsChart";
import { LanguageSplitChart } from "@/components/dashboard/LanguageSplitChart";
import { KpiCard } from "@/components/dashboard/KpiCard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const a = await api.analytics();
  const totalCalls = a.weekCalls.reduce((s, d) => s + d.calls, 0);
  const totalBookings = a.weekCalls.reduce((s, d) => s + d.bookings, 0);
  const conversion = totalCalls ? Math.round((totalBookings / totalCalls) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink-900">Analytics</h2>
        <p className="text-sm text-ink-500">How the AI receptionist is performing over time.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Calls this week" value={totalCalls} icon="☎" />
        <KpiCard label="Bookings this week" value={totalBookings} icon="✓" tone="good" />
        <KpiCard
          label="Conversion rate"
          value={`${conversion}%`}
          hint="Bookings / total calls"
          icon="▲"
          tone="good"
        />
        <KpiCard
          label="Recovery rate"
          value={`${a.missedCallRecoveryRate}%`}
          hint={`${a.recovered} of ${a.flagged} previously-missed`}
          icon="↻"
          tone="good"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <WeeklyCallsChart data={a.weekCalls} />
        </div>
        <LanguageSplitChart split={a.languageSplit} />
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-ink-900">Why these numbers matter</h3>
        <ul className="mt-3 space-y-2 text-sm text-ink-700">
          <li>
            <span className="font-semibold text-primary-700">Missed-call recovery</span> — the %
            of calls the front desk previously missed that the AI picked up and converted into a
            booking. This is the headline metric for a clinic owner.
          </li>
          <li>
            <span className="font-semibold text-primary-700">Conversion rate</span> — bookings
            divided by total calls. A healthy AI receptionist sits in the 60–80% range.
          </li>
          <li>
            <span className="font-semibold text-primary-700">Language mix</span> — shows the
            share of Telugu vs. English calls. For Warangal-tier clinics, expect 50%+ Telugu.
          </li>
        </ul>
      </Card>
    </div>
  );
}
