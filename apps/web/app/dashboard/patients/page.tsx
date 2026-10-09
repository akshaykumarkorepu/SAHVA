"use client";

import * as React from "react";
import { useApi, useMutation } from "@/lib/hooks";
import { post } from "@/lib/api";
import type { Paged, Patient } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatDate, formatPhone, LANGUAGE_LABEL } from "@/lib/format";

export default function PatientsPage() {
  const [linkFor, setLinkFor] = React.useState<Patient | null>(null);
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const list = useApi<Paged<Patient>>(
    `/patients?limit=100${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`,
    [debounced],
  );

  // One handset often covers a whole family, so group by number rather than
  // showing what looks like duplicate records.
  const groups = React.useMemo(() => {
    const byPhone = new Map<string, Patient[]>();
    for (const p of list.data?.data ?? []) {
      const list_ = byPhone.get(p.phone_e164) ?? [];
      list_.push(p);
      byPhone.set(p.phone_e164, list_);
    }
    return [...byPhone.entries()];
  }, [list.data]);

  return (
    <>
      <PageHeader title="Patients" subtitle="Search by name or phone number." />

      <div className="mb-4 max-w-sm">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Lakshmi, or +919885512345"
          aria-label="Search patients"
        />
      </div>

      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="patients"
          title={debounced ? "No patients match that" : "No patients yet"}
          body="Patients are created automatically the first time they call."
        />
      ) : (
        <div className="space-y-3">
          {groups.map(([phone, people]) => (
            <Card key={phone} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-900">{formatPhone(phone)}</p>
                {people.length > 1 && (
                  <Badge tone="info">{people.length} patients on this number</Badge>
                )}
              </div>
              <div className="mt-3 divide-y divide-ink-100">
                {people.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{p.full_name}</p>
                      <p className="truncate text-xs text-ink-subtle">
                        {p.approx_age_years ? `${p.approx_age_years} yrs · ` : ""}
                        {LANGUAGE_LABEL[p.preferred_language]} · since{" "}
                        {formatDate(p.created_at)}
                      </p>
                    </div>
                    {p.is_blocked && <Badge tone="bad">Blocked</Badge>}
                    <Button variant="ghost" size="sm" icon="message" onClick={() => setLinkFor(p)}>
                      Send link
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {linkFor && <PortalLinkModal patient={linkFor} onClose={() => setLinkFor(null)} />}
    </>
  );
}

type IssuedLink = {
  token_id: string;
  expires_at: string;
  url: string;
  patient: { id: string; full_name: string; phone_e164: string };
};

/**
 * Issue a patient portal link.
 *
 * The raw link is returned once and never stored — only its hash reaches the
 * database. If it is lost, staff issue a new one; there is no recovery, which
 * is the point of treating it as a credential.
 */
function PortalLinkModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const [issued, setIssued] = React.useState<IssuedLink | null>(null);
  const [copied, setCopied] = React.useState(false);
  const issue = useMutation(() => post<IssuedLink>(`/patients/${patient.id}/portal-link`, {}));

  const waText = issued
    ? encodeURIComponent(
        `Namaste ${patient.full_name}, you can see and manage your appointment here: ${issued.url}`,
      )
    : "";

  return (
    <Modal
      open
      onClose={onClose}
      title="Send appointment link"
      description={`${patient.full_name} · ${formatPhone(patient.phone_e164)}`}
      footer={
        issued ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
            <a
              href={`https://wa.me/${patient.phone_e164.replace("+", "")}?text=${waText}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button icon="message">Open WhatsApp</Button>
            </a>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={issue.pending}
              onClick={async () => {
                const r = await issue.run();
                if (r) setIssued(r);
              }}
            >
              Create link
            </Button>
          </>
        )
      }
    >
      {issued ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface-sunken p-3">
            <p className="break-all font-mono text-xs text-ink">{issued.url}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={copied ? "check" : "edit"}
            onClick={async () => {
              await navigator.clipboard.writeText(issued.url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
          <p className="flex items-start gap-2 text-xs text-ink-subtle">
            <Icon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-amber" />
            Shown once. Anyone with this link can see and change this patient&rsquo;s appointments,
            so send it only to {formatPhone(patient.phone_e164)}. Expires{" "}
            {formatDate(issued.expires_at)}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Creates a private link this patient can open from WhatsApp — no signup and no password.
            They can see their appointment, confirm it, and change the time.
          </p>
          {issue.error && <ErrorState error={issue.error} />}
        </div>
      )}
    </Modal>
  );
}
