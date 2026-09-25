"use client";

import * as React from "react";
import Link from "next/link";
import { useApi, useMutation } from "@/lib/hooks";
import { post } from "@/lib/api";
import type { ActionItem } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { ACTION_TYPE_LABEL, actionSeverity, relativeTime } from "@/lib/format";

/**
 * The Action Required queue.
 *
 * This is the product's differentiator and, until now, it had no UI at all.
 * The database already flags everything that needs a human — a doctor going
 * unavailable, an escalated call, a booking made off poorly-heard speech, a
 * confirmation that never reached the patient. This is where staff see it.
 */
export default function ActionsPage() {
  const { data, error, loading, reload } = useApi<ActionItem[]>("/actions");
  const resolve = useMutation((id: string, status: "resolved" | "dismissed") =>
    post(`/actions/${id}/resolve`, { status }),
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const items = data ?? [];
  const urgent = items.filter((i) => i.severity === "urgent" || i.severity === "high");
  const rest = items.filter((i) => i.severity !== "urgent" && i.severity !== "high");

  return (
    <>
      <PageHeader
        title="Action Required"
        subtitle={
          items.length === 0
            ? "Everything the AI handled went through cleanly."
            : `${items.length} item${items.length === 1 ? "" : "s"} need a person.`
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon="✓"
          title="Nothing needs you right now"
          body="When a doctor becomes unavailable, a call is escalated, or a confirmation fails to reach a patient, it appears here — never silently."
        />
      ) : (
        <div className="space-y-6">
          {urgent.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
                Needs attention now
              </h3>
              <div className="space-y-3">
                {urgent.map((item) => (
                  <ActionCard
                    key={item.id}
                    item={item}
                    onResolve={async (status) => {
                      await resolve.run(item.id!, status);
                      reload();
                    }}
                    pending={resolve.pending}
                  />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
                Everything else
              </h3>
              <div className="space-y-3">
                {rest.map((item) => (
                  <ActionCard
                    key={item.id}
                    item={item}
                    onResolve={async (status) => {
                      await resolve.run(item.id!, status);
                      reload();
                    }}
                    pending={resolve.pending}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function ActionCard({
  item,
  onResolve,
  pending,
}: {
  item: ActionItem;
  onResolve: (status: "resolved" | "dismissed") => void;
  pending: boolean;
}) {
  const sev = actionSeverity(item.severity!);
  const isBatch = item.type === "reschedule_needed" && item.related_batch_id;

  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={sev.tone}>{sev.label}</Badge>
            <span className="text-xs font-medium text-ink-500">
              {ACTION_TYPE_LABEL[item.type!]}
            </span>
            {item.is_overdue && <Badge tone="bad">Overdue</Badge>}
          </div>

          <p className="mt-2 text-sm font-medium text-ink-900">{item.title}</p>
          {item.description && (
            <p className="mt-1 text-sm text-ink-500">{item.description}</p>
          )}

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
            {item.created_at && <span>Raised {relativeTime(item.created_at)}</span>}
            {item.patient_name && <span>Patient: {item.patient_name}</span>}
            {item.doctor_name && <span>Doctor: {item.doctor_name}</span>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {isBatch && (
            <Link href={`/dashboard/actions/batch/${item.related_batch_id}`}>
              <Button>Review {item.total_affected ?? 0} patient{item.total_affected === 1 ? "" : "s"}</Button>
            </Link>
          )}
          {item.related_call_id && (
            <Link href={`/dashboard/calls?open=${item.related_call_id}`}>
              <Button variant="outline">Open call</Button>
            </Link>
          )}
          <Button variant="ghost" disabled={pending} onClick={() => onResolve("resolved")}>
            Done
          </Button>
        </div>
      </div>
    </Card>
  );
}
