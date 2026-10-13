"use client";

import * as React from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorState, LoadingRows, PageHeader, Segmented } from "@/components/ui";
import { KpiCard } from "@/components/dashboard/KpiCard";

type Event = {
  id: string;
  kind: string;
  actor_user_id: string | null;
  clinic_id: string | null;
  ip: string | null;
  method: string | null;
  path: string | null;
  details: Record<string, unknown>;
  created_at: string;
  clinics: { name: string } | null;
};
type Security = { days: number; by_kind: Record<string, number>; top_addresses: { ip: string; count: number }[]; events: Event[]; truncated: boolean };

const KIND: Record<string, { label: string; tone: "bad" | "warn" | "neutral" }> = {
  auth_failed: { label: "Failed sign-in", tone: "warn" },
  access_denied: { label: "Access denied", tone: "bad" },
  admin_denied: { label: "Admin access refused", tone: "bad" },
  portal_link_invalid: { label: "Invalid patient link", tone: "warn" },
  rate_limited: { label: "Rate limited", tone: "warn" },
  role_changed: { label: "Role changed", tone: "neutral" },
  member_added: { label: "Staff added", tone: "neutral" },
  member_removed: { label: "Staff removed", tone: "neutral" },
};

/**
 * What a break-in attempt or a mistake looks like from outside: refused
 * requests by kind and address, and every staff role change. Addresses and
 * paths only — never request bodies or patient links.
 */
export default function SecurityPage() {
  const [days, setDays] = React.useState<"1" | "7" | "30">("7");
  const q = useApi<Security>(`/admin/security?days=${days}`, [days]);

  const n = (k: string) => q.data?.by_kind[k] ?? 0;
  return (
    <>
      <PageHeader
        title="Security"
        subtitle="Refused requests and staff role changes. Bursts from one address are emailed to super admins."
        action={<Segmented value={days} onChange={setDays} options={[{ value: "1", label: "24 hours" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }]} />}
      />
      {q.loading ? (
        <LoadingRows rows={5} />
      ) : q.error || !q.data ? (
        <ErrorState error={q.error ?? new Error("No data")} onRetry={q.reload} />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard label="Failed sign-ins" value={n("auth_failed") + n("admin_denied")} sub={`${n("admin_denied")} on the admin console`} icon="shield" />
            <KpiCard label="Access denied" value={n("access_denied")} sub="Signed in, but not allowed" icon="warning" />
            <KpiCard label="Invalid patient links" value={n("portal_link_invalid")} sub="Expired, revoked or guessed" icon="eyeOff" />
            <KpiCard label="Staff changes" value={n("role_changed") + n("member_added") + n("member_removed")} sub={`${n("rate_limited")} rate-limited requests`} icon="patients" />
          </div>

          {q.data.top_addresses.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-ink">Most refused addresses</h2>
              <Card className="divide-y divide-line">
                {q.data.top_addresses.map((a) => (
                  <div key={a.ip} className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="font-mono text-ink">{a.ip}</span>
                    <span className="tabular-nums text-ink-muted">{a.count}</span>
                  </div>
                ))}
              </Card>
              <p className="mt-2 text-xs text-ink-subtle">Recorded at most once every few seconds per address and kind, so counts are a floor.</p>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Latest</h2>
            {q.data.events.length === 0 ? (
              <EmptyState icon="success" tone="good" title="Nothing refused" body="No failed sign-ins, denied requests or staff changes in this period." />
            ) : (
              <Card className="divide-y divide-line overflow-hidden">
                {q.data.events.map((e) => {
                  const k = KIND[e.kind] ?? { label: e.kind, tone: "neutral" as const };
                  const d = e.details as { role_before?: string; role_after?: string; role?: string; status?: number };
                  return (
                    <div key={e.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[180px_1fr_170px] sm:items-center">
                      <span><Badge tone={k.tone}>{k.label}</Badge></span>
                      <span className="min-w-0 truncate text-ink-muted">
                        {e.clinic_id && e.clinics ? (
                          <Link href={`/admin/clinics/${e.clinic_id}`} className="text-ink hover:underline">{e.clinics.name}</Link>
                        ) : null}
                        {e.clinic_id && e.clinics ? " · " : ""}
                        {e.kind === "role_changed"
                          ? `${d.role_before} → ${d.role_after}`
                          : e.kind === "member_added" || e.kind === "member_removed"
                            ? d.role ?? ""
                            : <span className="font-mono text-xs">{e.method} {e.path}{e.ip ? ` · ${e.ip}` : ""}</span>}
                      </span>
                      <span className="text-xs text-ink-subtle sm:text-right">{formatDateTime(e.created_at)}</span>
                    </div>
                  );
                })}
              </Card>
            )}
          </section>
        </div>
      )}
    </>
  );
}
