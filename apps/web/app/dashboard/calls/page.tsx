"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import type { Call, Paged } from "@/lib/types";
import type { Tables } from "@sahva/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  Select,
  Spinner,
} from "@/components/ui";
import { callOutcome, formatDateTime, formatPhone, LANGUAGE_LABEL } from "@/lib/format";

type CallRow = Call & {
  patients: { id: string; full_name: string } | null;
  call_summaries: { summary_en: string | null } | null;
};

type CallDetail = Call & {
  patients: { id: string; full_name: string; phone_e164: string } | null;
  turns: Tables<"call_turns">[];
  tool_invocations: Tables<"call_tool_invocations">[];
  summary: Tables<"call_summaries"> | null;
  /** "restricted": the owner hides transcripts from this role. "purged": past the clinic's retention. */
  transcript_status?: "available" | "restricted" | "purged";
};

function CallsView() {
  const params = useSearchParams();
  const { clinic } = useSession();
  const tz = clinic?.timezone;
  const [outcome, setOutcome] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(params.get("open"));

  const list = useApi<Paged<CallRow>>(
    `/calls?limit=100${outcome ? `&outcome=${outcome}` : ""}`,
    [outcome],
  );

  return (
    <>
      <PageHeader
        title="Calls"
        subtitle="Every call the AI receptionist handled. Open one to see the transcript."
        action={
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="w-auto">
            <option value="">All outcomes</option>
            <option value="booked">Booked</option>
            <option value="rescheduled">Rescheduled</option>
            <option value="cancelled">Cancelled</option>
            <option value="faq_answered">Question answered</option>
            <option value="escalated">Escalated</option>
            <option value="unresolved">Unresolved</option>
          </Select>
        }
      />

      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (list.data?.data ?? []).length === 0 ? (
        <EmptyState
          icon="calls"
          title="No calls yet"
          body="Once a clinic number is connected, every inbound call appears here with its full transcript."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-sunken/40 text-xs uppercase tracking-wide text-ink-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Caller</th>
                <th className="px-4 py-3 font-medium">Outcome</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Language</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">When</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(list.data?.data ?? []).map((c) => {
                const o = callOutcome(c.outcome);
                return (
                  <tr key={c.id} className="hover:bg-surface-sunken/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">
                        {c.patients?.full_name ?? "Unknown caller"}
                      </p>
                      <p className="text-xs text-ink-subtle">{formatPhone(c.from_e164)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={o.tone}>{o.label}</Badge>
                        {c.recovered_missed && <Badge tone="good">Recovered</Badge>}
                        {/* The outcome badge already says "Escalated" when that
                            is the outcome; only flag the handoff separately. */}
                        {c.escalated_to_human && c.outcome !== "escalated" && (
                          <Badge tone="warn">Handed off</Badge>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-ink-muted md:table-cell">
                      {c.primary_language ? LANGUAGE_LABEL[c.primary_language] : "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-ink-muted lg:table-cell">
                      {formatDateTime(c.started_at, tz)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" onClick={() => setOpenId(c.id)}>
                        View →
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {openId && <CallDetailModal id={openId} tz={tz} onClose={() => setOpenId(null)} />}
    </>
  );
}

function CallDetailModal({
  id,
  tz,
  onClose,
}: {
  id: string;
  tz?: string;
  onClose: () => void;
}) {
  const { data, loading, error } = useApi<CallDetail>(`/calls/${id}`);

  return (
    <Modal open onClose={onClose} title="Call transcript">
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} />
      ) : data ? (
        <div className="space-y-5">
          <div className="text-sm text-ink-subtle">
            {formatPhone(data.from_e164)} · {formatDateTime(data.started_at, tz)}
            {data.duration_sec ? ` · ${data.duration_sec}s` : ""}
          </div>

          {data.transcript_status === "restricted" && (
            <p role="note" className="rounded-lg border border-line px-3 py-2.5 text-sm text-ink-muted">
              Your clinic shows call transcripts to owners, managers and doctors only.
            </p>
          )}
          {data.transcript_status === "purged" && (
            <p role="note" className="rounded-lg border border-line px-3 py-2.5 text-sm text-ink-muted">
              This call&rsquo;s transcript was deleted under your clinic&rsquo;s retention setting. The call&rsquo;s time and
              outcome are kept.
            </p>
          )}

          {data.summary?.summary_en && (
            <div className="rounded-lg bg-surface-sunken/60 px-3 py-2.5 text-sm text-ink-muted">
              {data.summary.summary_en}
            </div>
          )}

          <div className="space-y-2">
            {data.turns.map((t) => (
              <div
                key={t.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  t.role === "caller"
                    ? "ml-auto bg-brand-600 text-white"
                    : "bg-surface-sunken text-ink"
                }`}
              >
                {t.content}
                {t.stt_confidence !== null && t.stt_confidence < 0.7 && (
                  <span className="mt-1 block text-xs opacity-75">
                    low confidence ({Math.round(t.stt_confidence * 100)}%)
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* What the model asked for vs. what the database allowed. A refusal
              here is the guard rail working, and it should be visible. */}
          {data.tool_invocations.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Actions attempted
              </h4>
              <div className="space-y-1.5">
                {data.tool_invocations.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-xs"
                  >
                    <Badge tone={t.allowed ? "good" : "bad"}>
                      {t.allowed ? "allowed" : "refused"}
                    </Badge>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{t.tool_name}</p>
                      {!t.allowed && t.denial_reason && (
                        <p className="text-ink-subtle">{t.denial_reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

export default function CallsPage() {
  return (
    <React.Suspense fallback={<Spinner />}>
      <CallsView />
    </React.Suspense>
  );
}
