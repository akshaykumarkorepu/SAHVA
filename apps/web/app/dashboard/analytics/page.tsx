"use client";

import * as React from "react";
import { useApi } from "@/lib/hooks";
import type { AnalyticsSummary, Doctor } from "@/lib/types";
import { Card, ErrorState, PageHeader, Select, Spinner } from "@/components/ui";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { CallVolumeChart } from "@/components/dashboard/CallVolumeChart";

type CallCost = {
  call_id: string;
  cost_inr: number;
  stt_micro_inr: number;
  tts_micro_inr: number;
  llm_micro_inr: number;
  telephony_micro_inr: number;
};

export default function AnalyticsPage() {
  const [days, setDays] = React.useState(30);
  const summary = useApi<AnalyticsSummary>(`/analytics/summary?days=${days}`, [days]);
  const costs = useApi<CallCost[]>(`/analytics/costs?days=${days}`, [days]);

  if (summary.loading) return <Spinner />;
  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.reload} />;

  const t = summary.data?.totals;
  const rows = costs.data ?? [];
  const totalMicro = rows.reduce(
    (acc, r) => ({
      stt: acc.stt + Number(r.stt_micro_inr),
      tts: acc.tts + Number(r.tts_micro_inr),
      llm: acc.llm + Number(r.llm_micro_inr),
      tel: acc.tel + Number(r.telephony_micro_inr),
    }),
    { stt: 0, tts: 0, llm: 0, tel: 0 },
  );
  const grand = totalMicro.stt + totalMicro.tts + totalMicro.llm + totalMicro.tel;

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Performance and real measured cost."
        action={
          <Select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-auto"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </Select>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Calls" value={t?.calls ?? 0} />
        <KpiCard label="Bookings" value={t?.bookings ?? 0} tone="good" />
        <KpiCard label="Conversion" value={`${t?.conversion_rate ?? 0}%`} sub="Bookings / calls" />
        <KpiCard
          label="Recovered"
          value={t?.recovered_missed ?? 0}
          sub="Calls that would have been missed"
          tone="good"
        />
      </div>

      <Card className="mt-6 p-5">
        <h3 className="text-sm font-semibold text-ink-900">Call volume</h3>
        <p className="mb-3 text-xs text-ink-500">Total calls against successful bookings</p>
        <CallVolumeChart data={summary.data?.daily ?? []} />
      </Card>

      {/* Unit economics. This is the number that decides pricing, so it is
          measured from real vendor usage rather than estimated. */}
      <Card className="mt-6 p-5">
        <h3 className="text-sm font-semibold text-ink-900">Cost per call</h3>
        <p className="mb-4 text-xs text-ink-500">
          Measured from actual vendor usage over {rows.length} call{rows.length === 1 ? "" : "s"}.
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-ink-500">
            No metered calls yet. Costs appear once real calls run through the voice pipeline.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <CostCell label="Speech-to-text" micro={totalMicro.stt} grand={grand} />
              <CostCell label="Text-to-speech" micro={totalMicro.tts} grand={grand} />
              <CostCell label="Language model" micro={totalMicro.llm} grand={grand} />
              <CostCell label="Telephony" micro={totalMicro.tel} grand={grand} />
              <div className="rounded-lg bg-ink-100/60 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                  Per call
                </p>
                <p className="mt-1 text-xl font-semibold text-ink-900">
                  ₹{(grand / 1_000_000 / rows.length).toFixed(2)}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  ₹{((grand / 1_000_000 / rows.length) * 100).toFixed(0)} per 100 calls
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-ink-500">
              Margin on a ₹999 Starter tier at 100 calls/month:{" "}
              <span className="font-medium text-ink-700">
                {Math.round((1 - (grand / 1_000_000 / rows.length) * 100 / 999) * 100)}%
              </span>
            </p>
          </>
        )}
      </Card>
    </>
  );
}

function CostCell({ label, micro, grand }: { label: string; micro: number; grand: number }) {
  const pct = grand > 0 ? Math.round((micro / grand) * 100) : 0;
  return (
    <div className="rounded-lg border border-ink-100 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink-900">₹{(micro / 1_000_000).toFixed(2)}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div className="h-full bg-primary-600" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-500">{pct}% of spend</p>
    </div>
  );
}
