"use client";

import { useApi } from "@/lib/hooks";
import { inr } from "@/lib/pricing";
import { ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { KpiCard } from "@/components/dashboard/KpiCard";

type Overview = {
  clinics: number;
  newClinicsThisMonth: number;
  trialing: number;
  trialsEndingIn3Days: number;
  paying: number;
  payingMonthly: number;
  payingYearly: number;
  lapsed: number;
  mrrPaise: number;
  arrPaise: number;
  collectedThisMonthPaise: number;
  paymentsThisMonth: number;
};

/** The business at a glance. Figures come from /api/admin/overview. */
export default function AdminOverview() {
  const q = useApi<Overview>("/admin/overview");
  const o = q.data;

  return (
    <>
      <PageHeader title="Overview" subtitle="Every clinic on SAHVA, and what they pay." />
      {q.error ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : !o ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[124px]" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Revenue</h2>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <KpiCard label="MRR" value={inr(o.mrrPaise)} sub="Monthly + yearly ÷ 12" icon="rupee" tone="brand" />
              <KpiCard label="ARR" value={inr(o.arrPaise)} sub="MRR × 12" icon="analytics" />
              <KpiCard label="Collected this month" value={inr(o.collectedThisMonthPaise)} sub={`${o.paymentsThisMonth} payment${o.paymentsThisMonth === 1 ? "" : "s"}`} icon="success" />
              <KpiCard label="Paying clinics" value={o.paying} sub={`${o.payingMonthly} monthly · ${o.payingYearly} yearly`} icon="check" />
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Clinics</h2>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <KpiCard label="All clinics" value={o.clinics} sub={`${o.newClinicsThisMonth} new this month`} icon="patients" />
              <KpiCard label="On trial" value={o.trialing} sub={`${o.trialsEndingIn3Days} ending within 3 days`} icon="clock" tone={o.trialsEndingIn3Days > 0 ? "warn" : "neutral"} />
              <KpiCard label="Lapsed" value={o.lapsed} sub="Trial or plan ended unpaid" icon="warning" tone={o.lapsed > 0 ? "warn" : "neutral"} />
              {/* Clinics still in trial have not decided, so they are left out. */}
              <KpiCard
                label="Trial → paid"
                value={o.paying + o.lapsed > 0 ? `${Math.round((o.paying / (o.paying + o.lapsed)) * 100)}%` : "—"}
                sub="Of clinics past their trial"
                icon="sparkles"
              />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
