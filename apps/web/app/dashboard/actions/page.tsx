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
  LoadingRows,
  PageHeader,
  Section,
  Segmented,
  cn,
} from "@/components/ui";
import { ACTION_GUIDE, CATEGORY_LABEL, countByCategory, type ActionCategory } from "@/lib/actions";
import { Icon, type IconName } from "@/components/icons";
import { ACTION_TYPE_LABEL, actionSeverity, relativeTime } from "@/lib/format";

/**
 * The Action Required queue — the product's differentiator.
 *
 * Everything the database flagged because a human has to decide: a doctor going
 * unavailable, an escalated call, a booking made off poorly-heard speech, a
 * confirmation that never reached the patient.
 */
export default function ActionsPage() {
  const { data, error, loading, reload } = useApi<ActionItem[]>("/actions");
  const [filter, setFilter] = React.useState<ActionCategory | "all">("all");
  const resolve = useMutation((id: string, status: "resolved" | "dismissed") =>
    post(`/actions/${id}/resolve`, { status }),
  );

  if (error) return <ErrorState error={error} onRetry={reload} />;

  const all = data ?? [];
  const counts = countByCategory(all);
  const items = filter === "all" ? all : all.filter((i) => i.type && ACTION_GUIDE[i.type].category === filter);
  const urgent = items.filter((i) => i.severity === "urgent" || i.severity === "high");
  const rest = items.filter((i) => i.severity !== "urgent" && i.severity !== "high");

  const onResolve = async (id: string, status: "resolved" | "dismissed") => {
    await resolve.run(id, status);
    reload();
  };

  return (
    <>
      <PageHeader
        eyebrow={all.length > 0 ? `${all.length} open` : undefined}
        title="Action Required"
        subtitle={
          all.length === 0
            ? "Everything the AI handled went through cleanly."
            : "These need a person. SAHVA never settles them by guessing."
        }
      />

      {all.length > 0 && (
        <div className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All ${all.length}` },
              ...(Object.keys(CATEGORY_LABEL) as ActionCategory[]).map((c) => ({
                value: c,
                label: `${CATEGORY_LABEL[c]} ${counts[c]}`,
              })),
            ]}
          />
        </div>
      )}

      {loading ? (
        <LoadingRows rows={3} />
      ) : all.length > 0 && items.length === 0 ? (
        <EmptyState icon="success" tone="good" title="Nothing in this group" body="Pick another group above." />
      ) : items.length === 0 ? (
        <EmptyState
          icon="success"
          tone="good"
          title="Nothing needs you right now"
          body="When a doctor becomes unavailable, a call is escalated, or a confirmation fails to reach a patient, it appears here — never silently."
        />
      ) : (
        <div className="space-y-7">
          {urgent.length > 0 && (
            <Section title="Needs attention now">
              <div className="space-y-3">
                {urgent.map((item, i) => (
                  <ActionCard key={item.id} item={item} index={i} onResolve={onResolve} pending={resolve.pending} />
                ))}
              </div>
            </Section>
          )}

          {rest.length > 0 && (
            <Section title="Everything else">
              <div className="space-y-3">
                {rest.map((item, i) => (
                  <ActionCard key={item.id} item={item} index={i} onResolve={onResolve} pending={resolve.pending} />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </>
  );
}

const TYPE_ICON: Record<string, IconName> = {
  reschedule_needed: "timeOff",
  ai_escalation: "warning",
  low_confidence_call: "calls",
  failed_message: "message",
  booking_conflict: "appointments",
  missed_call_followup: "calls",
  unrecognised_caller: "patients",
};

function ActionCard({
  item,
  index,
  onResolve,
  pending,
}: {
  item: ActionItem;
  index: number;
  onResolve: (id: string, status: "resolved" | "dismissed") => void;
  pending: boolean;
}) {
  const sev = actionSeverity(item.severity!);
  const guide = item.type ? ACTION_GUIDE[item.type] : null;
  const isBatch = item.type === "reschedule_needed" && item.related_batch_id;
  const critical = item.severity === "urgent";

  return (
    <Card
      className={cn(
        "animate-fade-up overflow-hidden p-4 md:p-5",
        critical && "ring-1 ring-accent-rose/20",
      )}
    >
      <div style={{ animationDelay: `${index * 50}ms` }} className="flex flex-wrap items-start gap-4">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-2xl ring-1 ring-inset",
            critical
              ? "bg-accent-rose/12 text-accent-rose ring-accent-rose/20"
              : "bg-surface-sunken text-ink-muted ring-line",
          )}
        >
          <Icon name={TYPE_ICON[item.type!] ?? "inbox"} className="h-[18px] w-[18px]" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={sev.tone} dot>
              {sev.label}
            </Badge>
            <span className="text-xs font-medium text-ink-subtle">{ACTION_TYPE_LABEL[item.type!]}</span>
            {item.is_overdue && <Badge tone="bad">Overdue</Badge>}
          </div>

          <p className="mt-2 text-[15px] font-semibold leading-snug text-ink">{item.title}</p>
          {item.description && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{item.description}</p>}

          {guide && (
            <dl className="mt-3 grid gap-2 rounded-xl bg-surface-sunken/70 p-3 text-[13px] leading-relaxed sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Why a person</dt>
                <dd className="mt-0.5 text-ink-muted">{guide.why}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Next step</dt>
                <dd className="mt-0.5 text-ink">{guide.next}</dd>
              </div>
            </dl>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-subtle">
            {item.created_at && (
              <span className="inline-flex items-center gap-1">
                <Icon name="clock" className="h-3 w-3" />
                {relativeTime(item.created_at)}
              </span>
            )}
            {item.patient_name && <span>Patient: {item.patient_name}</span>}
            {item.doctor_name && <span>Doctor: {item.doctor_name}</span>}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">
          {isBatch && (
            <Link href={`/dashboard/actions/batch/${item.related_batch_id}`} className="flex-1 sm:flex-none">
              <Button iconRight="arrowRight" className="w-full">
                Review {item.total_affected ?? 0}
              </Button>
            </Link>
          )}
          {item.related_call_id && (
            <Link href={`/dashboard/calls?open=${item.related_call_id}`} className="flex-1 sm:flex-none">
              <Button variant="secondary" icon="calls" className="w-full">
                Open call
              </Button>
            </Link>
          )}
          {/* A reschedule closes itself when the last patient is handled; a
              manual "Done" could hide patients nobody has called. */}
          {!guide?.closesItself && (
            <Button
              variant="ghost"
              icon="check"
              disabled={pending}
              onClick={() => onResolve(item.id!, "resolved")}
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
