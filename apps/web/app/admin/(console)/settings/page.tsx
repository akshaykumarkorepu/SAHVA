"use client";

import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useAdminSession } from "@/lib/admin/session";
import { inr } from "@/lib/pricing";
import { Badge, Button, Card, ErrorState, Field, Input, LoadingRows, PageHeader, Textarea } from "@/components/ui";

type Settings = {
  legal_name: string;
  address: string;
  state: string;
  state_code: string;
  gstin: string | null;
  pan: string | null;
  email: string;
  phone: string;
  sac_code: string;
  gst_rate_bps: number;
  refund_second_approval_paise: number;
  invoicing_ready: boolean;
  invoices_issued: number;
};

/**
 * SAHVA's own details: the seller on every invoice, and the refund size that
 * needs a second admin. Super admins edit; everyone else reads. Each save is
 * in the audit log, and invoices already issued keep the details they had.
 */
export default function PlatformSettings() {
  const q = useApi<Settings>("/admin/settings");
  if (q.loading) return <LoadingRows rows={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error("No settings")} onRetry={q.reload} />;
  return <Form s={q.data} />;
}

function Form({ s }: { s: Settings }) {
  const { me } = useAdminSession();
  const canEdit = me?.role === "super_admin";
  const client = useQueryClient();
  const [d, setD] = React.useState({
    legal_name: s.legal_name,
    address: s.address,
    state: s.state,
    state_code: s.state_code,
    gstin: s.gstin ?? "",
    pan: s.pan ?? "",
    email: s.email,
    phone: s.phone,
    sac_code: s.sac_code,
    gst_rate: String(s.gst_rate_bps / 100),
    threshold: String(s.refund_second_approval_paise / 100),
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setD((x) => ({ ...x, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    try {
      await api("/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          legal_name: d.legal_name.trim(),
          address: d.address.trim(),
          state: d.state.trim(),
          state_code: d.state_code.trim(),
          gstin: d.gstin.trim().toUpperCase(),
          pan: d.pan.trim().toUpperCase(),
          email: d.email.trim(),
          phone: d.phone.trim(),
          sac_code: d.sac_code.trim(),
          gst_rate_bps: Math.round(Number(d.gst_rate) * 100),
          refund_second_approval_paise: Math.round(Number(d.threshold) * 100),
        }),
      });
      toast.success("Saved. Any invoices that were waiting have been issued.");
      void client.invalidateQueries({ queryKey: ["api"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="SAHVA's business details for invoices, and the refund approval rule." />
      <div className="mb-6 flex flex-wrap items-center gap-2" role="status">
        {s.invoicing_ready ? (
          <Badge tone="good">Invoicing on · {s.invoices_issued} issued</Badge>
        ) : (
          <Badge tone="warn">Invoicing paused — fill in the legal name and address</Badge>
        )}
        <Badge tone={s.gstin ? "good" : "neutral"}>{s.gstin ? "GST tax invoices" : "Bills of supply (no GSTIN)"}</Badge>
      </div>

      <fieldset disabled={!canEdit} className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink">Seller on every invoice</h2>
          <Field label="Legal name" hint="As registered, and on the bank account Razorpay pays.">
            <Input value={d.legal_name} onChange={set("legal_name")} />
          </Field>
          <Field label="Registered address">
            <Textarea rows={3} value={d.address} onChange={set("address")} />
          </Field>
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <Field label="State"><Input value={d.state} onChange={set("state")} /></Field>
            <Field label="State code"><Input value={d.state_code} onChange={set("state_code")} inputMode="numeric" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="GSTIN" hint="Leave empty if not GST-registered."><Input value={d.gstin} onChange={set("gstin")} /></Field>
            <Field label="PAN"><Input value={d.pan} onChange={set("pan")} /></Field>
            <Field label="Billing email"><Input type="email" value={d.email} onChange={set("email")} /></Field>
            <Field label="Phone"><Input value={d.phone} onChange={set("phone")} /></Field>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-ink">Tax</h2>
            <p className="text-xs text-ink-subtle">
              Prices are GST-inclusive: ₹1,999 is the total a clinic pays. With a GSTIN, invoices split it into taxable value
              plus CGST + SGST (Telangana clinics) or IGST (other states). Confirm the SAC code with your CA.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SAC code"><Input value={d.sac_code} onChange={set("sac_code")} inputMode="numeric" /></Field>
              <Field label="GST rate (%)"><Input value={d.gst_rate} onChange={set("gst_rate")} inputMode="decimal" /></Field>
            </div>
          </Card>
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-ink">Refunds</h2>
            <Field
              label="Second approval above (₹)"
              hint={`Refunds above ${inr(Number(d.threshold) * 100 || 0)} need a different finance admin to approve. ₹2,000 means one admin can refund a month, two are needed for a year.`}
            >
              <Input value={d.threshold} onChange={set("threshold")} inputMode="numeric" />
            </Field>
          </Card>
          {canEdit ? (
            <Button loading={busy} onClick={() => void save()}>Save settings</Button>
          ) : (
            <p className="text-xs text-ink-subtle">Only a super admin can change these.</p>
          )}
        </div>
      </fieldset>
    </>
  );
}
