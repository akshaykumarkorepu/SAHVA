"use client";

import * as React from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { STATUS_LABEL, type VerificationStatus } from "@/lib/verification";
import { formatDateTime, relativeTime } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorState, LoadingRows, PageHeader, Segmented } from "@/components/ui";

type Group = "waiting" | "needs_info" | "approved" | "rejected" | "suspended";
type Row = {
  id: string;
  name: string;
  city: string;
  verification_status: VerificationStatus;
  hfr_id: string | null;
  establishment_reg_no: string | null;
  registration_state: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

const GROUPS: { value: Group; label: string }[] = [
  { value: "waiting", label: "Waiting" },
  { value: "needs_info", label: "Needs info" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
];

/** The verification queue, oldest first. */
export default function Applications() {
  const [group, setGroup] = React.useState<Group>("waiting");
  const q = useApi<{ rows: Row[]; counts: Record<Group, number> }>(`/admin/applications?status=${group}`, [group]);

  return (
    <>
      <PageHeader title="Applications" subtitle="Clinics waiting for SAHVA to verify them, oldest first." />
      <div className="mb-5 overflow-x-auto">
        <Segmented
          value={group}
          onChange={setGroup}
          options={GROUPS.map((g) => ({ value: g.value, label: `${g.label}${q.data ? ` ${q.data.counts[g.value] ?? 0}` : ""}` }))}
        />
      </div>
      {q.loading ? (
        <LoadingRows rows={4} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : (q.data?.rows ?? []).length === 0 ? (
        <EmptyState icon="success" tone="good" title="Nothing here" body="No clinics in this group." />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {q.data!.rows.map((r) => {
            const st = STATUS_LABEL[r.verification_status];
            return (
              <Link key={r.id} href={`/admin/applications/${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-surface-sunken/60">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{r.name}</span>
                  <span className="block text-xs text-ink-subtle">
                    {r.city} · {r.hfr_id ? `HFR ${r.hfr_id}` : r.establishment_reg_no ? `${r.establishment_reg_no} (${r.registration_state})` : "No facility ID"}
                  </span>
                </span>
                <span className="text-right text-xs text-ink-subtle" title={r.submitted_at ? formatDateTime(r.submitted_at) : ""}>
                  {r.submitted_at ? `Submitted ${relativeTime(r.submitted_at)}` : "—"}
                </span>
                <Badge tone={st.tone}>{st.label}</Badge>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
