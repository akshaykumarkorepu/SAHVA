"use client";

import { useApi } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import { Card, EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/ui";

type Row = {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  created_at: string;
  platform_admins: { full_name: string } | null;
};

/** Every admin action, newest first. Read-only — the database refuses edits. */
export default function AdminAudit() {
  const q = useApi<Row[]>("/admin/audit?limit=200");
  return (
    <>
      <PageHeader title="Audit log" subtitle="Everything an admin has done. Nothing here can be edited or deleted." />
      {q.loading ? (
        <LoadingRows rows={5} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState icon="inbox" title="Nothing yet" body="Admin sign-ins and actions appear here." />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {(q.data ?? []).map((r) => (
            <div key={r.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[180px_1fr_200px] sm:items-center">
              <span className="font-mono text-xs text-ink">{r.action}</span>
              <span className="min-w-0 truncate text-ink-muted">
                {r.platform_admins?.full_name ?? "—"}
                {r.target_type ? ` · ${r.target_type} ${r.target_id ?? ""}` : ""}
                {r.reason ? ` · “${r.reason}”` : ""}
              </span>
              <span className="text-xs text-ink-subtle sm:text-right">{formatDateTime(r.created_at)}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
