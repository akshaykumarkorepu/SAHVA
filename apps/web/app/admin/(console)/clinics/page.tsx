"use client";

import * as React from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { inr } from "@/lib/pricing";
import { STAGE, clinicStage, type Stage } from "@/lib/clinicStage";
import { formatDate, relativeTime } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorState, Input, LoadingRows, PageHeader, Segmented } from "@/components/ui";

type Row = {
  id: string;
  name: string;
  city: string;
  verification_status: string;
  created_at: string;
  subscription_status: string | null;
  billing_cycle: string | null;
  current_period_end: string | null;
  is_live: boolean;
  staff: number;
  patients: number;
  appointments_30d: number;
  ai_bookings_30d: number;
  last_appointment_at: string | null;
  paid_total_paise: number;
};

type Filter = "all" | "attention" | "trial" | "paying" | "pending";
const FILTERS: { value: Filter; label: string; match: (s: Stage) => boolean }[] = [
  { value: "all", label: "All", match: () => true },
  { value: "attention", label: "Needs attention", match: (s) => s === "grace" || s === "read_only" || s === "suspended" },
  { value: "trial", label: "On trial", match: (s) => s === "trial" },
  { value: "paying", label: "Paying", match: (s) => s === "paying" },
  { value: "pending", label: "In review", match: (s) => s === "pending" || s === "needs_info" },
];

/** Every clinic on SAHVA. */
export default function Clinics() {
  const q = useApi<Row[]>("/admin/clinics");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [search, setSearch] = React.useState("");

  const rows = (q.data ?? []).map((r) => ({ ...r, stage: clinicStage(r) }));
  const f = FILTERS.find((x) => x.value === filter)!;
  const needle = search.trim().toLowerCase();
  const shown = rows.filter((r) => f.match(r.stage) && (!needle || `${r.name} ${r.city}`.toLowerCase().includes(needle)));

  return (
    <>
      <PageHeader title="Clinics" subtitle="Every clinic, where it stands, and how much it is used." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((x) => ({ value: x.value, label: `${x.label} ${rows.filter((r) => x.match(r.stage)).length}` }))}
        />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or city" aria-label="Search clinics" className="max-w-xs" />
      </div>

      {q.loading ? (
        <LoadingRows rows={5} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : shown.length === 0 ? (
        <EmptyState icon="patients" title="No clinics here" body="Try another filter." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-ink-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Clinic</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Until</th>
                <th className="px-4 py-3 text-right font-medium">Patients</th>
                <th className="px-4 py-3 text-right font-medium">Bookings 30d</th>
                <th className="px-4 py-3 text-right font-medium">Paid to date</th>
                <th className="px-4 py-3 font-medium">Last booking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((r) => {
                const st = STAGE[r.stage];
                return (
                  <tr key={r.id} className="hover:bg-surface-sunken/60">
                    <td className="px-4 py-3">
                      <Link href={`/admin/clinics/${r.id}`} className="font-medium text-ink hover:underline">
                        {r.name}
                      </Link>
                      <span className="block text-xs text-ink-subtle">
                        {r.city} · {r.staff} staff
                      </span>
                    </td>
                    <td className="px-4 py-3" title={st.hint}>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{r.current_period_end ? formatDate(r.current_period_end) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.patients}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.appointments_30d}
                      {r.appointments_30d > 0 && <span className="block text-xs text-ink-subtle">{r.ai_bookings_30d} by AI</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(r.paid_total_paise)}</td>
                    <td className="px-4 py-3 text-ink-muted">{r.last_appointment_at ? relativeTime(r.last_appointment_at) : "Never"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
