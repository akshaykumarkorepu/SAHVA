"use client";

import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api, patch } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { COUNCILS, STATES, idProblems, ownerStatus, type ApplicationIds, type VerificationStatus } from "@/lib/verification";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { Icon } from "@/components/icons";

type Doc = { id: string; kind: string; file_name: string; size_bytes: number; uploaded_at: string };

const KIND_LABEL: Record<string, string> = {
  facility_registration: "Facility registration certificate",
  doctor_registration: "Doctor's registration certificate",
  other: "Other",
};

/**
 * Where the owner follows their clinic's verification: the status and any
 * note from the reviewer, the IDs they gave (editable while under review),
 * and the certificates.
 */
export default function VerificationPage() {
  const { clinic, role } = useSession();
  const owner = role === "owner";
  const status = (clinic?.verification_status ?? "approved") as VerificationStatus;
  const editable = owner && (status === "submitted" || status === "needs_info");
  const docs = useApi<Doc[]>(role === "owner" || role === "manager" ? "/clinic/documents" : null, [role]);
  const copy = ownerStatus(status);

  if (!clinic) return null;

  return (
    <>
      <PageHeader title="Verification" subtitle="SAHVA checks every clinic before it can take patients." />

      <Card className="mb-6 p-5">
        <Badge tone={copy.tone}>{copy.title}</Badge>
        <p className="mt-2 text-sm text-ink-muted">{copy.body}</p>
        {clinic.review_note && (
          <p className="mt-3 rounded-xl bg-surface-sunken p-3 text-sm text-ink">
            <span className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle">Note from SAHVA</span>
            {clinic.review_note}
          </p>
        )}
        {clinic.submitted_at && (
          <p className="mt-3 text-xs text-ink-subtle">Submitted {formatDateTime(clinic.submitted_at, clinic.timezone)}</p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <IdsCard editable={editable} />
        <Documents docs={docs.data ?? []} loading={docs.loading} canUpload={editable} />
      </div>
    </>
  );
}

function IdsCard({ editable }: { editable: boolean }) {
  const { clinic } = useSession();
  const client = useQueryClient();
  const [ids, setIds] = React.useState<ApplicationIds>(() => ({
    idType: clinic?.hfr_id ? "hfr" : "state",
    hfrId: clinic?.hfr_id ?? "",
    regNo: clinic?.establishment_reg_no ?? "",
    regState: clinic?.registration_state ?? "Telangana",
    ownerRegNo: clinic?.owner_reg_no ?? "",
    ownerCouncil: clinic?.owner_council ?? "",
    gstin: clinic?.gstin ?? "",
  }));
  const [pending, setPending] = React.useState(false);
  const problems = idProblems(ids);
  const set = <K extends keyof ApplicationIds>(k: K, v: ApplicationIds[K]) => setIds((x) => ({ ...x, [k]: v }));

  async function save() {
    setPending(true);
    try {
      await patch("/clinic/application", {
        hfr_id: ids.idType === "hfr" ? ids.hfrId.trim() : "",
        establishment_reg_no: ids.idType === "state" ? ids.regNo.trim() : "",
        registration_state: ids.idType === "state" ? ids.regState : "",
        owner_reg_no: ids.ownerRegNo.trim(),
        owner_council: ids.ownerCouncil,
        gstin: ids.gstin.trim().toUpperCase(),
      });
      toast.success("Sent back to SAHVA for review.");
      // The session holds the clinic; reload so the banner and status update.
      void client.invalidateQueries({ queryKey: ["api"] });
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not save.");
      setPending(false);
    }
  }

  const row = (label: string, value: string | null | undefined) => (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="text-right font-medium text-ink">{value || "—"}</dd>
    </div>
  );

  if (!editable) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Registration details</h2>
        <dl className="mt-2 divide-y divide-line">
          {row("HFR ID", clinic?.hfr_id)}
          {row("State registration", clinic?.establishment_reg_no ? `${clinic.establishment_reg_no} (${clinic.registration_state})` : null)}
          {row("Owner doctor", clinic?.owner_reg_no ? `${clinic.owner_reg_no} · ${clinic.owner_council}` : null)}
          {row("GSTIN", clinic?.gstin)}
        </dl>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-sm font-semibold text-ink">Registration details</h2>
      <Field label="Facility identifier">
        <Select value={ids.idType} onChange={(e) => set("idType", e.target.value as "hfr" | "state")}>
          <option value="hfr">ABDM HFR ID</option>
          <option value="state">State registration</option>
        </Select>
      </Field>
      {ids.idType === "hfr" ? (
        <Field label="HFR ID" required>
          <Input value={ids.hfrId} onChange={(e) => set("hfrId", e.target.value.toUpperCase())} />
        </Field>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <Field label="Registration number" required>
            <Input value={ids.regNo} onChange={(e) => set("regNo", e.target.value)} />
          </Field>
          <Field label="Issued by" required>
            <Select value={ids.regState} onChange={(e) => set("regState", e.target.value)}>
              {STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Owner doctor's registration no." required>
          <Input value={ids.ownerRegNo} onChange={(e) => set("ownerRegNo", e.target.value)} />
        </Field>
        <Field label="Registered with" required>
          <Select value={ids.ownerCouncil} onChange={(e) => set("ownerCouncil", e.target.value)}>
            <option value="">Choose a council</option>
            {COUNCILS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="GSTIN" hint="Optional.">
        <Input value={ids.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} />
      </Field>
      {problems.length > 0 && <p className="text-xs text-ink-subtle">Still needed: {problems.join(", ")}.</p>}
      <Button onClick={() => void save()} loading={pending} disabled={problems.length > 0}>
        Save and send for review
      </Button>
    </Card>
  );
}

function Documents({ docs, loading, canUpload }: { docs: Doc[]; loading: boolean; canUpload: boolean }) {
  const client = useQueryClient();
  const [kind, setKind] = React.useState("facility_registration");
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Upload a PDF, JPG or PNG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("That file is over 5 MB. A photo or scan at lower quality is fine.");
      return;
    }
    setBusy(true);
    try {
      await api(`/clinic/documents?kind=${kind}&name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type },
      });
      toast.success("Uploaded.");
      void client.invalidateQueries({ queryKey: ["api"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The upload did not work.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">Certificates</h2>
      <p className="mt-1 text-xs text-ink-subtle">Seen only by SAHVA reviewers, through links that expire in minutes.</p>
      {loading ? null : docs.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Nothing uploaded yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              <Icon name="check" className="h-4 w-4 shrink-0 text-brand-700" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">{d.file_name}</span>
                <span className="block text-xs text-ink-subtle">{KIND_LABEL[d.kind] ?? d.kind}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <Field label="What is it?">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
          />
          <Button variant="secondary" icon="plus" loading={busy} onClick={() => input.current?.click()}>
            Upload PDF or photo
          </Button>
        </div>
      )}
    </Card>
  );
}
