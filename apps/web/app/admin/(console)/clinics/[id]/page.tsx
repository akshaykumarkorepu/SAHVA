"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { post } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useAdminSession } from "@/lib/admin/session";
import { inr } from "@/lib/pricing";
import { STAGE, clinicStage } from "@/lib/clinicStage";
import { STATUS_LABEL, type VerificationStatus } from "@/lib/verification";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge, Button, Card, ErrorState, Field, Input, LoadingRows, PageHeader, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/icons";
import { KpiCard } from "@/components/dashboard/KpiCard";

type Detail = {
  clinic: { id: string; name: string; city: string; phone_e164: string; verification_status: VerificationStatus; created_at: string };
  is_live: boolean;
  subscriptions: { id: string; status: string; billing_cycle: string | null; trial_ends_at: string | null; current_period_end: string }[];
  payments: { id: string; billing_cycle: string; amount_paise: number; status: string; razorpay_payment_id: string | null; razorpay_order_id: string; paid_at: string | null; created_at: string }[];
  staff: { role: string; status: string; full_name: string | null; phone: string | null }[];
  usage: { appointments_30d: number; by_source: Record<string, number>; no_show_rate: number | null; calls_30d: number; escalated_30d: number; open_actions: number; portal_links_30d: number };
  patients: { total: number; new_30d: number };
  notes: { id: string; body: string; created_at: string; platform_admins: { full_name: string } | null }[];
  history: { id: string; action: string; reason: string | null; created_at: string; platform_admins: { full_name: string } | null }[];
};

const SOURCE: Record<string, string> = { ai_call: "AI call", staff_manual: "Staff", walk_in: "Walk-in", whatsapp: "WhatsApp", web: "Online" };

/**
 * One clinic for an operator: where it stands, what it has paid, how it is
 * used, and what can be done — each action with a reason, each recorded.
 * Patient figures are counts; no patient is identifiable here.
 */
export default function ClinicDetail({ params }: { params: { id: string } }) {
  const q = useApi<Detail>(`/admin/clinics/${params.id}`, [params.id]);
  if (q.loading) return <LoadingRows rows={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error("Not found")} onRetry={q.reload} />;

  const d = q.data;
  const sub = d.subscriptions[0] ?? null;
  const stage = clinicStage({
    verification_status: d.clinic.verification_status,
    subscription_status: sub?.status ?? null,
    current_period_end: sub?.current_period_end ?? null,
  });
  const st = STAGE[stage];

  return (
    <>
      <Link href="/admin/clinics" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <Icon name="chevronLeft" className="h-4 w-4" /> Clinics
      </Link>
      <PageHeader title={d.clinic.name} subtitle={`${d.clinic.city} · ${d.clinic.phone_e164} · joined ${formatDate(d.clinic.created_at)}`} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        <Badge tone={d.is_live ? "good" : "bad"}>{d.is_live ? "Live for patients" : "Not live for patients"}</Badge>
        <Link href={`/admin/applications/${d.clinic.id}`} className="text-sm text-brand-700 underline">
          Verification: {STATUS_LABEL[d.clinic.verification_status].label}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Patients" value={d.patients.total} sub={`${d.patients.new_30d} new in 30 days`} icon="patients" />
        <KpiCard label="Bookings, 30 days" value={d.usage.appointments_30d} sub={Object.entries(d.usage.by_source).map(([k, v]) => `${v} ${SOURCE[k] ?? k}`).join(" · ") || "None"} icon="appointments" />
        <KpiCard label="Calls, 30 days" value={d.usage.calls_30d} sub={`${d.usage.escalated_30d} passed to staff`} icon="calls" />
        <KpiCard label="No-show rate" value={d.usage.no_show_rate == null ? "—" : `${d.usage.no_show_rate}%`} sub={`${d.usage.open_actions} open actions · ${d.usage.portal_links_30d} patient links`} icon="warning" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Payments</h2>
            {d.payments.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No payments.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line text-sm">
                {d.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span>
                      {inr(p.amount_paise)} · {p.billing_cycle}
                      <span className="block text-xs text-ink-subtle">{formatDateTime(p.paid_at ?? p.created_at)}</span>
                    </span>
                    <span className="text-right">
                      <Badge tone={p.status === "paid" ? "good" : p.status === "failed" ? "bad" : "neutral"}>
                        {p.status === "created" ? "Not completed" : p.status}
                      </Badge>
                      <span className="block font-mono text-[11px] text-ink-subtle">{p.razorpay_payment_id ?? p.razorpay_order_id}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Staff</h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {d.staff.map((s, i) => (
                <li key={i} className="flex justify-between gap-3 py-2">
                  <span className="text-ink">{s.full_name ?? "—"}<span className="block text-xs text-ink-subtle">{s.phone ?? ""}</span></span>
                  <span className="text-right capitalize text-ink-muted">{s.role}<span className="block text-xs">{s.status}</span></span>
                </li>
              ))}
            </ul>
          </Card>

          <Notes clinicId={d.clinic.id} notes={d.notes} />

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">History</h2>
            {d.history.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Nothing yet.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {d.history.map((h) => (
                  <li key={h.id} className="flex justify-between gap-3">
                    <span className="text-ink">
                      <span className="font-mono text-xs">{h.action}</span> · {h.platform_admins?.full_name ?? "—"}
                      {h.reason && <span className="block text-xs text-ink-muted">“{h.reason}”</span>}
                    </span>
                    <span className="shrink-0 text-xs text-ink-subtle">{formatDateTime(h.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <SubscriptionCard clinicId={d.clinic.id} sub={sub} />
      </div>
    </>
  );
}

function SubscriptionCard({ clinicId, sub }: { clinicId: string; sub: Detail["subscriptions"][number] | null }) {
  const { me } = useAdminSession();
  const client = useQueryClient();
  const canAdjust = me?.role === "super_admin" || me?.role === "finance";
  const [days, setDays] = React.useState("7");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const action = sub?.status === "active" ? "extend_period" : "extend_trial";

  async function extend() {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 90) return toast.error("Extend by 1 to 90 days.");
    if (!note.trim()) return toast.error("Write the reason — it goes in the audit log.");
    setBusy(true);
    try {
      await post(`/admin/clinics/${clinicId}/subscription`, { action, days: n, note: note.trim() });
      toast.success(`Extended by ${n} days.`);
      setNote("");
      void client.invalidateQueries({ queryKey: ["api"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-6">
      <h2 className="text-sm font-semibold text-ink">Subscription</h2>
      {!sub ? (
        <p className="text-sm text-ink-muted">None — starts when the clinic is approved.</p>
      ) : (
        <>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-ink-subtle">Status</dt><dd className="capitalize text-ink">{sub.status}{sub.billing_cycle ? ` · ${sub.billing_cycle}` : ""}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-subtle">{sub.status === "trialing" ? "Trial ends" : "Paid until"}</dt><dd className="text-ink">{formatDate(sub.current_period_end)}</dd></div>
          </dl>
          {canAdjust ? (
            <div className="space-y-3 border-t border-line pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                {action === "extend_trial" ? "Extend the trial" : "Extend the paid period"}
              </p>
              <Field label="Days">
                <Select value={days} onChange={(e) => setDays(e.target.value)}>
                  {["3", "7", "14", "30"].map((x) => <option key={x}>{x}</option>)}
                </Select>
              </Field>
              <Field label="Reason" hint="Recorded in the audit log.">
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Button className="w-full" loading={busy} onClick={() => void extend()}>
                Extend by {days} days
              </Button>
            </div>
          ) : (
            <p className="border-t border-line pt-3 text-xs text-ink-subtle">Finance admins can extend trials and periods.</p>
          )}
        </>
      )}
    </Card>
  );
}

function Notes({ clinicId, notes }: { clinicId: string; notes: Detail["notes"] }) {
  const client = useQueryClient();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await post(`/admin/clinics/${clinicId}/notes`, { body: body.trim() });
      setBody("");
      void client.invalidateQueries({ queryKey: ["api"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The note did not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">Notes</h2>
      <ul className="mt-2 space-y-3 text-sm">
        {notes.map((n) => (
          <li key={n.id}>
            <p className="whitespace-pre-wrap text-ink">{n.body}</p>
            <p className="text-xs text-ink-subtle">{n.platform_admins?.full_name ?? "—"} · {formatDateTime(n.created_at)}</p>
          </li>
        ))}
        {notes.length === 0 && <li className="text-ink-muted">No notes yet.</li>}
      </ul>
      <div className="mt-3 flex gap-2">
        <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note for the team" aria-label="New note" />
        <Button variant="secondary" loading={busy} onClick={() => void add()}>Add</Button>
      </div>
    </Card>
  );
}
