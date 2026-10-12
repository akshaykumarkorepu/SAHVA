"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { post } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { NEEDS_REASON, STATUS_LABEL, allowedDecisions, type VerificationStatus } from "@/lib/verification";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, ErrorState, Field, LoadingRows, PageHeader, Textarea } from "@/components/ui";
import { Icon } from "@/components/icons";

type Detail = {
  clinic: {
    id: string;
    name: string;
    address_line: string | null;
    city: string;
    pincode: string | null;
    phone_e164: string;
    verification_status: VerificationStatus;
    hfr_id: string | null;
    establishment_reg_no: string | null;
    registration_state: string | null;
    owner_reg_no: string | null;
    owner_council: string | null;
    gstin: string | null;
    submitted_at: string | null;
    review_note: string | null;
  };
  owner: { full_name: string | null; phone: string | null; email: string | null } | null;
  documents: { id: string; kind: string; file_name: string; url: string | null; uploaded_at: string }[];
  possible_duplicates: { id: string; name: string; city: string; verification_status: VerificationStatus; owner_reg_no: string | null }[];
  history: { id: string; action: string; reason: string | null; created_at: string; platform_admins: { full_name: string } | null }[];
};

const DECISION: Record<string, { label: string; variant: "primary" | "secondary" | "danger" | "ghost" }> = {
  start_review: { label: "Start review", variant: "secondary" },
  approve: { label: "Approve — start trial", variant: "primary" },
  needs_info: { label: "Ask for more information", variant: "secondary" },
  reject: { label: "Reject", variant: "danger" },
  suspend: { label: "Suspend", variant: "danger" },
  reinstate: { label: "Reinstate", variant: "primary" },
};

/**
 * One application. Checks a reviewer does by hand are listed so nothing is
 * skipped; a reason is required for anything other than starting or
 * approving, and every decision lands in the audit log with it.
 */
export default function ApplicationDetail({ params }: { params: { id: string } }) {
  const client = useQueryClient();
  const q = useApi<Detail>(`/admin/applications/${params.id}`, [params.id]);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [checks, setChecks] = React.useState<Record<string, boolean>>({});

  if (q.loading) return <LoadingRows rows={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error("Not found")} onRetry={q.reload} />;
  const { clinic: c, owner, documents, possible_duplicates, history } = q.data;
  const st = STATUS_LABEL[c.verification_status];
  const decisions = allowedDecisions(c.verification_status);

  const CHECKS = [
    c.hfr_id
      ? ["hfr", `HFR ID ${c.hfr_id} found on facility.abdm.gov.in, name and address match`]
      : ["state", `Registration ${c.establishment_reg_no} matches the certificate issued by ${c.registration_state}`],
    ["doctor", `Doctor ${c.owner_reg_no} found in the ${c.owner_council} register`],
    ["certificate", "Certificate is legible and names this clinic"],
    ["phone", "Clinic phone answered, or listed publicly for this clinic"],
  ];
  const allChecked = CHECKS.every(([k]) => checks[k]);

  async function decide(decision: string) {
    if (NEEDS_REASON.has(decision) && !note.trim()) {
      toast.error("Write the reason first — the clinic will see it.");
      return;
    }
    setBusy(decision);
    try {
      await post(`/admin/applications/${c.id}/decision`, { decision, note: note.trim() || undefined });
      toast.success(`${DECISION[decision].label.split(" —")[0]}: recorded.`);
      setNote("");
      void client.invalidateQueries({ queryKey: ["api"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That decision did not save.");
    } finally {
      setBusy(null);
    }
  }

  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-[150px_1fr] gap-3 py-2 text-sm">
      <dt className="text-ink-subtle">{k}</dt>
      <dd className="text-ink">{v || "—"}</dd>
    </div>
  );

  return (
    <>
      <Link href="/admin/applications" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <Icon name="chevronLeft" className="h-4 w-4" /> Applications
      </Link>
      <PageHeader title={c.name} subtitle={`${c.city}${c.submitted_at ? ` · submitted ${formatDateTime(c.submitted_at)}` : ""}`} />
      <div className="mb-6">
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>

      {possible_duplicates.length > 0 && (
        <div role="alert" className="mb-6 rounded-2xl border border-accent-amber/30 bg-accent-amber/[0.07] p-4 text-sm text-ink">
          <p className="font-semibold">Possible duplicates</p>
          <ul className="mt-1 list-disc pl-5">
            {possible_duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/applications/${d.id}`} className="underline">
                  {d.name}, {d.city}
                </Link>{" "}
                — {STATUS_LABEL[d.verification_status].label}
                {d.owner_reg_no === c.owner_reg_no ? " · same doctor" : " · same name and city"}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Application</h2>
            <dl className="mt-2 divide-y divide-line">
              {row("HFR ID", c.hfr_id)}
              {row("State registration", c.establishment_reg_no ? `${c.establishment_reg_no} (${c.registration_state})` : null)}
              {row("Owner doctor", c.owner_reg_no ? `${c.owner_reg_no} · ${c.owner_council}` : null)}
              {row("GSTIN", c.gstin)}
              {row("Address", [c.address_line, c.city, c.pincode].filter(Boolean).join(", "))}
              {row("Clinic phone", c.phone_e164)}
              {row("Applicant", owner ? `${owner.full_name ?? "—"} · ${owner.email ?? "—"} · ${owner.phone ?? "—"}` : null)}
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Certificates</h2>
            {documents.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">None uploaded yet. Ask the clinic for them before approving.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-ink">{d.file_name}</span>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium text-brand-700 underline">
                        Open (2 min link)
                      </a>
                    ) : (
                      <span className="text-xs text-ink-subtle">Unavailable</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">History</h2>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No decisions yet.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex justify-between gap-3">
                    <span className="text-ink">
                      <span className="font-mono text-xs">{h.action}</span> · {h.platform_admins?.full_name ?? "—"}
                      {h.reason ? <span className="block text-xs text-ink-muted">“{h.reason}”</span> : null}
                    </span>
                    <span className="shrink-0 text-xs text-ink-subtle">{formatDateTime(h.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold text-ink">Review</h2>
          {decisions.length === 0 ? (
            <p className="text-sm text-ink-muted">No further decisions for a {st.label.toLowerCase()} clinic.</p>
          ) : (
            <>
              {decisions.includes("approve") && (
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-subtle">Before approving</legend>
                  {CHECKS.map(([k, label]) => (
                    <label key={k} className="flex gap-2 text-sm text-ink">
                      <input type="checkbox" checked={!!checks[k]} onChange={(e) => setChecks((x) => ({ ...x, [k]: e.target.checked }))} className="mt-0.5" />
                      {label}
                    </label>
                  ))}
                </fieldset>
              )}
              <Field label="Reason or note" hint="Shown to the clinic. Required to ask for information, reject or suspend.">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </Field>
              <div className="flex flex-col gap-2">
                {decisions.map((d) => (
                  <Button
                    key={d}
                    variant={DECISION[d].variant}
                    loading={busy === d}
                    disabled={busy !== null || (d === "approve" && !allChecked)}
                    onClick={() => void decide(d)}
                  >
                    {DECISION[d].label}
                  </Button>
                ))}
                {decisions.includes("approve") && !allChecked && (
                  <p className="text-xs text-ink-subtle">Tick every check to approve.</p>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
