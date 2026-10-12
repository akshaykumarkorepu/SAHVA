"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { post } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useAdminSession } from "@/lib/admin/session";
import { inr } from "@/lib/pricing";
import { policyRefund, type RefundablePayment } from "@/lib/refundPolicy";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Modal, PageHeader, Segmented, Textarea } from "@/components/ui";

type Payment = RefundablePayment & {
  id: string;
  clinic_id: string;
  status: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  created_at: string;
  clinics: { name: string; city: string } | null;
};
type Exception = {
  id: string;
  kind: string;
  status: string;
  clinic_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  amount_paise: number | null;
  details: Record<string, unknown>;
  detected_at: string;
  resolution: string | null;
  clinics: { name: string } | null;
};
type Event = {
  id: string;
  event_type: string | null;
  signature_ok: boolean;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  amount_paise: number | null;
  outcome: string | null;
  received_at: string;
};

/** What each exception means, and what fixing it involves. */
const KIND: Record<string, { label: string; fix: string; activate?: boolean }> = {
  paid_not_activated: { label: "Paid, not activated", fix: "Check Razorpay, then activate.", activate: true },
  duplicate_payment: { label: "Paid twice", fix: "Refund the second payment from the ledger, then resolve." },
  amount_mismatch: { label: "Wrong amount", fix: "Activate against what was paid, or refund it.", activate: true },
  authorized_not_captured: { label: "Held, not captured", fix: "Capture it in Razorpay (or let it auto-void), then re-run reconciliation." },
  refund_failed: { label: "Refund failed", fix: "Retry the refund in Razorpay or pay out by hand, then resolve." },
  dispute: { label: "Dispute", fix: "Answer it in Razorpay with evidence; consider suspending the clinic." },
  signature_failure: { label: "Bad signature", fix: "Check for a misconfigured webhook secret or forged requests." },
};

const STATUS_TONE: Record<string, "good" | "warn" | "neutral" | "bad"> = { paid: "good", created: "neutral", expired: "neutral", failed: "bad" };

export default function Payments() {
  const [tab, setTab] = React.useState<"ledger" | "exceptions" | "events">("ledger");
  const open = useApi<Exception[]>("/admin/payments/exceptions?status=open");
  const { me } = useAdminSession();
  const finance = me?.role === "super_admin" || me?.role === "finance";
  const client = useQueryClient();
  const [running, setRunning] = React.useState(false);

  async function reconcileNow() {
    setRunning(true);
    try {
      const s = await post<{ checked: number; activated: number; held: number; authorized: number; expired: number; errors: number }>("/admin/payments/reconcile");
      toast.success(`Checked ${s.checked} unfinished orders: ${s.activated} activated, ${s.authorized} held, ${s.held} wrong amount, ${s.expired} expired${s.errors ? `, ${s.errors} could not be checked` : ""}.`);
      void client.invalidateQueries({ queryKey: ["api"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reconciliation did not run.");
    } finally {
      setRunning(false);
    }
  }

  const openCount = open.data?.length ?? 0;
  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Every order and payment, what went wrong, and what Razorpay told us."
        action={
          finance ? (
            <Button variant="secondary" loading={running} onClick={() => void reconcileNow()}>
              Check unfinished orders with Razorpay
            </Button>
          ) : undefined
        }
      />
      <div className="mb-5 overflow-x-auto">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "ledger", label: "Ledger" },
            { value: "exceptions", label: `Exceptions${openCount ? ` ${openCount}` : ""}` },
            { value: "events", label: "Webhook events" },
          ]}
        />
      </div>
      {tab === "ledger" ? <Ledger finance={finance} /> : tab === "exceptions" ? <Exceptions finance={finance} /> : <Events />}
    </>
  );
}

function Ledger({ finance }: { finance: boolean }) {
  const q = useApi<Payment[]>("/admin/payments");
  const [refunding, setRefunding] = React.useState<Payment | null>(null);
  if (q.loading) return <LoadingRows rows={5} />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <EmptyState icon="rupee" title="No payments yet" body="Orders appear here as soon as a clinic starts paying." />;

  return (
    <>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">Clinic</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Razorpay</th>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <Link href={`/admin/clinics/${p.clinic_id}`} className="font-medium text-ink hover:underline">{p.clinics?.name ?? "—"}</Link>
                  <span className="block text-xs text-ink-subtle">{p.clinics?.city}</span>
                </td>
                <td className="px-4 py-3 capitalize">{p.billing_cycle}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {inr(p.captured_paise ?? p.amount_paise)}
                  {p.refunded_paise > 0 && <span className="block text-xs text-accent-rose">−{inr(p.refunded_paise)} refunded</span>}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status === "created" ? "Not completed" : p.status}</Badge>
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-ink-subtle">{p.razorpay_payment_id ?? p.razorpay_order_id}</td>
                <td className="px-4 py-3 text-ink-muted">{formatDateTime(p.paid_at ?? p.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  {finance && p.status === "paid" && p.refunded_paise < (p.captured_paise ?? p.amount_paise) && (
                    <Button size="sm" variant="ghost" onClick={() => setRefunding(p)}>Refund</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {refunding && <RefundDialog payment={refunding} onClose={() => setRefunding(null)} />}
    </>
  );
}

/**
 * Refund through Razorpay. Starts from what the published policy suggests;
 * the admin can change it, must give a reason, and chooses whether the
 * clinic loses the unused part of the period.
 */
function RefundDialog({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const client = useQueryClient();
  const suggestion = policyRefund(payment);
  const max = (payment.captured_paise ?? payment.amount_paise) - payment.refunded_paise;
  const [rupees, setRupees] = React.useState(String(suggestion.paise / 100));
  const [revoke, setRevoke] = React.useState(true);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const paise = Math.round(Number(rupees) * 100);
  const valid = Number.isFinite(paise) && paise > 0 && paise <= max && reason.trim().length >= 3;

  async function submit() {
    setBusy(true);
    try {
      await post(`/admin/payments/${payment.id}/refund`, { amount_paise: paise, revoke_period: revoke, reason: reason.trim() });
      toast.success(`Refunded ${inr(paise)} through Razorpay.`);
      void client.invalidateQueries({ queryKey: ["api"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The refund did not go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Refund ${payment.clinics?.name ?? "payment"}`}
      description={`${inr(payment.captured_paise ?? payment.amount_paise)} ${payment.billing_cycle}, ${payment.razorpay_payment_id}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} disabled={!valid} onClick={() => void submit()}>
            Refund {Number.isFinite(paise) && paise > 0 ? inr(paise) : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        <p className="rounded-xl bg-surface-sunken p-3 text-sm text-ink">
          Policy suggests <strong>{inr(suggestion.paise)}</strong>. {suggestion.why}
        </p>
        <Field label="Amount (₹)" hint={`At most ${inr(max)}.`}>
          <Input value={rupees} onChange={(e) => setRupees(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" />
        </Field>
        <label className="flex gap-2 text-sm text-ink">
          <input type="checkbox" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} className="mt-0.5" />
          Take back the unused part of this payment&rsquo;s period
        </label>
        <Field label="Reason" hint="Recorded in the audit log and sent to Razorpay with the refund.">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function Exceptions({ finance }: { finance: boolean }) {
  const [status, setStatus] = React.useState<"open" | "resolved" | "dismissed">("open");
  const q = useApi<Exception[]>(`/admin/payments/exceptions?status=${status}`, [status]);
  const client = useQueryClient();
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  async function act(ex: Exception, action: "activate" | "resolved" | "dismissed") {
    const note = (notes[ex.id] ?? "").trim();
    if (note.length < 3) return toast.error("Say what was done — it goes in the audit log.");
    setBusy(ex.id + action);
    try {
      await post(`/admin/payments/exceptions/${ex.id}/resolve`, { action, note });
      toast.success(action === "activate" ? "Checked with Razorpay and activated." : "Closed.");
      void client.invalidateQueries({ queryKey: ["api"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="mb-4">
        <Segmented value={status} onChange={setStatus} options={[{ value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }, { value: "dismissed", label: "Dismissed" }]} />
      </div>
      {q.loading ? (
        <LoadingRows rows={3} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState icon="success" tone="good" title={status === "open" ? "Nothing needs attention" : "None"} body="Payment problems appear here as soon as they are detected." />
      ) : (
        <div className="space-y-3">
          {q.data!.map((ex) => {
            const k = KIND[ex.kind] ?? { label: ex.kind, fix: "" };
            return (
              <Card key={ex.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Badge tone={ex.kind === "dispute" ? "bad" : "warn"}>{k.label}</Badge>
                    <p className="mt-2 font-medium text-ink">
                      {ex.clinics?.name ?? "Unknown clinic"}
                      {ex.amount_paise != null && <span className="ml-2 text-ink-muted">{inr(ex.amount_paise)}</span>}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      {formatDateTime(ex.detected_at)} · <span className="font-mono">{ex.razorpay_payment_id ?? ex.razorpay_order_id ?? "—"}</span>
                    </p>
                    {Object.keys(ex.details ?? {}).length > 0 && (
                      <p className="mt-1 text-xs text-ink-muted">{Object.entries(ex.details).map(([a, b]) => `${a.replace(/_/g, " ")}: ${String(b)}`).join(" · ")}</p>
                    )}
                    <p className="mt-2 text-sm text-ink-muted">{k.fix}</p>
                    {ex.resolution && <p className="mt-2 text-sm text-ink">Resolved: {ex.resolution}</p>}
                  </div>
                </div>
                {status === "open" && finance && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <Input
                      value={notes[ex.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [ex.id]: e.target.value }))}
                      placeholder="What was done"
                      aria-label="What was done"
                      className="min-w-[220px] flex-1"
                    />
                    {k.activate && (
                      <Button size="sm" loading={busy === ex.id + "activate"} onClick={() => void act(ex, "activate")}>Check and activate</Button>
                    )}
                    <Button size="sm" variant="secondary" loading={busy === ex.id + "resolved"} onClick={() => void act(ex, "resolved")}>Resolved</Button>
                    <Button size="sm" variant="ghost" loading={busy === ex.id + "dismissed"} onClick={() => void act(ex, "dismissed")}>Dismiss</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Events() {
  const q = useApi<Event[]>("/admin/payments/events");
  if (q.loading) return <LoadingRows rows={5} />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <EmptyState icon="inbox" title="No webhook events yet" body="Razorpay's notifications appear here once the webhook is configured." />;
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {rows.map((e) => (
        <div key={e.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[200px_1fr_170px] sm:items-center">
          <span className="font-mono text-xs text-ink">
            {e.event_type ?? "—"}
            {!e.signature_ok && <Badge tone="bad" className="ml-2">bad signature</Badge>}
          </span>
          <span className="min-w-0 truncate text-ink-muted">
            {e.outcome ?? "—"}
            {e.amount_paise != null ? ` · ${inr(e.amount_paise)}` : ""}
            {e.razorpay_payment_id ? ` · ${e.razorpay_payment_id}` : ""}
          </span>
          <span className="text-xs text-ink-subtle sm:text-right">{formatDateTime(e.received_at)}</span>
        </div>
      ))}
    </Card>
  );
}
