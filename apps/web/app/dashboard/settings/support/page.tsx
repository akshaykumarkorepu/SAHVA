"use client";

import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { patch, post } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, ErrorState, Field, LoadingRows, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/icons";

type Grant = {
  id: string;
  reason: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  granted_by: string | null;
  active: boolean;
  records_opened: number;
};

/**
 * Privacy settings, and break-glass on the clinic's terms. SAHVA staff never see patients unless
 * the owner opens access here — for a few hours, with a reason, closable at
 * any time. Every patient they open appears in that patient's access log.
 */
export default function SupportAccessPage() {
  const { role, clinic } = useSession();
  const tz = clinic?.timezone;
  const isOwner = role === "owner";
  const client = useQueryClient();
  const q = useApi<Grant[]>("/clinic/support-access");
  const [hours, setHours] = React.useState("4");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  if (q.loading) return <LoadingRows rows={3} />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error("Could not load")} onRetry={q.reload} />;
  const open = q.data.find((g) => g.active) ?? null;

  async function grant() {
    if (reason.trim().length < 3) return toast.error("Say what SAHVA support should look at.");
    setBusy(true);
    try {
      await post("/clinic/support-access", { hours: Number(hours), reason: reason.trim() });
      setReason("");
      toast.success(`Support can look for the next ${hours} hours.`);
      void client.invalidateQueries({ queryKey: ["api"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await post(`/clinic/support-access/${id}/revoke`);
      toast.success("Support access closed.");
      void client.invalidateQueries({ queryKey: ["api"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PrivacyCard isOwner={isOwner} />

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <Icon name="support" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
          <div className="space-y-1 text-sm">
            <h2 className="font-semibold text-ink">Let SAHVA support look at a patient</h2>
            <p className="text-ink-muted">
              SAHVA staff cannot see your patients. If you need help with a booking or a patient&rsquo;s details, open
              access here for a few hours. Support sees names, phone numbers and appointments — never medical records — and
              every patient they open shows in that patient&rsquo;s access log.
            </p>
          </div>
        </div>

        {open ? (
          <div className="mt-5 rounded-xl border border-line bg-surface-sunken p-4 text-sm" role="status">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <Badge tone="warn">Open until {formatDateTime(open.expires_at, tz)}</Badge>
                <span className="mt-2 block text-ink">“{open.reason}”</span>
                <span className="block text-xs text-ink-subtle">
                  {open.records_opened} patient record{open.records_opened === 1 ? "" : "s"} opened so far
                </span>
              </span>
              {isOwner && (
                <Button variant="secondary" loading={busy} onClick={() => void revoke(open.id)}>
                  Close access now
                </Button>
              )}
            </div>
          </div>
        ) : isOwner ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_160px]">
            <Field label="What should support look at?" hint="They see this reason. Mention the patient or booking.">
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </Field>
            <Field label="For how long">
              <Select value={hours} onChange={(e) => setHours(e.target.value)}>
                <option value="1">1 hour</option>
                <option value="4">4 hours</option>
                <option value="24">24 hours</option>
                <option value="72">3 days</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Button loading={busy} onClick={() => void grant()}>
                Open access for support
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm text-ink-muted">Only the clinic owner can open access for SAHVA support.</p>
        )}
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">History</h2>
        {q.data.length === 0 ? (
          <p className="text-sm text-ink-muted">Support has never had access to this clinic.</p>
        ) : (
          <Card className="divide-y divide-line">
            {q.data.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="block text-ink">“{g.reason}”</span>
                  <span className="block text-xs text-ink-subtle">
                    {g.granted_by ?? "Owner"} · {formatDateTime(g.created_at, tz)} ·{" "}
                    {g.revoked_at ? `closed ${formatDateTime(g.revoked_at, tz)}` : g.active ? "open" : "expired"}
                  </span>
                </span>
                <span className="text-xs text-ink-muted">
                  {g.records_opened} record{g.records_opened === 1 ? "" : "s"} opened
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

type PrivacySettings = { settings: { transcript_retention_days: number; receptionists_see_transcripts: boolean } | null };

/**
 * How long call transcripts are kept, and who reads them. Patients describe
 * symptoms on these calls; keeping less for less time is the safer default.
 */
function PrivacyCard({ isOwner }: { isOwner: boolean }) {
  const q = useApi<PrivacySettings>("/clinic");
  const client = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  // Shown at once, saved behind; put back if the save fails.
  const [local, setLocal] = React.useState<PrivacySettings["settings"]>(null);
  const server = q.data?.settings ?? null;
  const s = local ?? server;
  if (q.loading || !s) return <LoadingRows rows={2} />;

  async function save(change: Partial<NonNullable<PrivacySettings["settings"]>>) {
    const before = s!;
    setLocal({ ...before, ...change });
    setBusy(true);
    try {
      await patch("/clinic/settings", change);
      toast.success("Saved.");
      void client.invalidateQueries({ queryKey: ["api"] });
    } catch (e) {
      setLocal(before);
      toast.error(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">Call transcripts</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Patients often describe symptoms when they call. Transcripts older than this are deleted automatically; the call&rsquo;s
        time and outcome are kept. Every transcript opened is recorded.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Keep transcripts for">
          <Select
            value={String(s.transcript_retention_days)}
            disabled={!isOwner || busy}
            onChange={(e) => void save({ transcript_retention_days: Number(e.target.value) })}
          >
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">6 months</option>
            <option value="365">1 year</option>
          </Select>
        </Field>
        <label className="flex items-start gap-2 pt-6 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={s.receptionists_see_transcripts}
            disabled={!isOwner || busy}
            onChange={(e) => void save({ receptionists_see_transcripts: e.target.checked })}
          />
          <span>
            Receptionists can read transcripts
            <span className="block text-xs text-ink-subtle">Owners, managers and doctors always can.</span>
          </span>
        </label>
      </div>
      {!isOwner && <p className="mt-3 text-xs text-ink-subtle">Only the clinic owner can change these.</p>}
    </Card>
  );
}
