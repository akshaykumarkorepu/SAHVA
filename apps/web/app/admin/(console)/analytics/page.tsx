"use client";

import * as React from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { inr } from "@/lib/pricing";
import { Badge, Card, EmptyState, ErrorState, LoadingRows, PageHeader, Segmented } from "@/components/ui";
import { MonthlyBars, monthLabel } from "@/components/admin/MonthlyBars";

type Month = {
  month: string;
  new_clinics: number;
  approved: number;
  first_payments: number;
  collected_paise: number;
  refunded_paise: number;
  mrr_paise: number;
  paying_clinics: number;
  new_patients: number;
  appointments: number;
  ai_bookings: number;
  completed: number;
  no_shows: number;
};
type Clinic = { id: string; name: string; city: string; health: { score: number; band: "healthy" | "watch" | "at_risk"; reasons: string[] } };

const BAND = { at_risk: { label: "At risk", tone: "bad" as const }, watch: { label: "Watch", tone: "warn" as const }, healthy: { label: "Healthy", tone: "good" as const } };
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

/**
 * The business over time, and which clinics need a call. Patient figures are
 * platform-wide counts; nothing here identifies a patient.
 */
export default function Analytics() {
  const [months, setMonths] = React.useState<"6" | "12">("6");
  const q = useApi<{ months: Month[]; clinics: Clinic[] }>(`/admin/analytics?months=${months}`, [months]);

  if (q.loading) return <LoadingRows rows={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error("No data")} onRetry={q.reload} />;
  const { months: rows, clinics } = q.data;
  const attention = clinics.filter((c) => c.health.band !== "healthy");

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Revenue from the payment ledger, growth, platform-wide activity, and clinic health."
        action={<Segmented value={months} onChange={setMonths} options={[{ value: "6", label: "6 months" }, { value: "12", label: "12 months" }]} />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">MRR at month end</h2>
          <p className="mb-3 text-xs text-ink-subtle">What paid periods covered the month&rsquo;s last day — yearly at a twelfth, refunds removed.</p>
          <MonthlyBars data={rows} value={(r) => r.mrr_paise} format={inr} label="MRR" detail={(r) => `${r.paying_clinics} paying clinic${r.paying_clinics === 1 ? "" : "s"}`} />
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Bookings across all clinics</h2>
          <p className="mb-3 text-xs text-ink-subtle">Appointments in the month, cancelled ones left out.</p>
          <MonthlyBars data={rows} value={(r) => r.appointments} format={(n) => n.toLocaleString("en-IN")} label="Bookings" detail={(r) => `${pct(r.ai_bookings, r.appointments)} booked by the AI`} />
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Month by month</h2>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-right text-sm tabular-nums">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-ink-subtle">
              <tr>
                <th className="px-3 py-3 text-left font-medium">Month</th>
                <th className="px-3 py-3 font-medium">New clinics</th>
                <th className="px-3 py-3 font-medium">Approved</th>
                <th className="px-3 py-3 font-medium">First payments</th>
                <th className="px-3 py-3 font-medium">Collected</th>
                <th className="px-3 py-3 font-medium">Refunded</th>
                <th className="px-3 py-3 font-medium">MRR</th>
                <th className="px-3 py-3 font-medium">New patients</th>
                <th className="px-3 py-3 font-medium">Bookings</th>
                <th className="px-3 py-3 font-medium">By AI</th>
                <th className="px-3 py-3 font-medium">No-show</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...rows].reverse().map((r) => (
                <tr key={r.month}>
                  <td className="whitespace-nowrap px-3 py-2 text-left text-ink">{monthLabel(r.month)}</td>
                  <td className="px-3 py-2">{r.new_clinics}</td>
                  <td className="px-3 py-2">{r.approved}</td>
                  <td className="px-3 py-2">{r.first_payments}</td>
                  <td className="px-3 py-2">{inr(r.collected_paise)}</td>
                  <td className="px-3 py-2">{r.refunded_paise ? `−${inr(r.refunded_paise)}` : "—"}</td>
                  <td className="px-3 py-2 font-medium text-ink">{inr(r.mrr_paise)}</td>
                  <td className="px-3 py-2">{r.new_patients}</td>
                  <td className="px-3 py-2">{r.appointments}</td>
                  <td className="px-3 py-2">{pct(r.ai_bookings, r.appointments)}</td>
                  <td className="px-3 py-2">{pct(r.no_shows, r.completed + r.no_shows)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-ink">Clinic health</h2>
        <p className="mb-3 text-xs text-ink-subtle">
          {clinics.length - attention.length} of {clinics.length} live clinics healthy. Each point lost has a reason; clinics in review are not scored.
        </p>
        {attention.length === 0 ? (
          <EmptyState icon="success" tone="good" title="Every clinic looks healthy" body="Nothing to follow up this week." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {attention.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/admin/clinics/${c.id}`} className="font-medium text-ink hover:underline">
                    {c.name}
                    <span className="block text-xs font-normal text-ink-subtle">{c.city}</span>
                  </Link>
                  <span className="text-right">
                    <Badge tone={BAND[c.health.band].tone}>{BAND[c.health.band].label}</Badge>
                    <span className="mt-1 block font-display text-lg font-semibold tabular-nums text-ink">{c.health.score}</span>
                  </span>
                </div>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
                  {c.health.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
