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
  cn,
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

      <div className="mb-6 max-w-sm">
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map(([phone, people]) => (
            <Card key={phone} variant="default" className="relative overflow-hidden p-0">
              <div className="bg-surface-sunken/50 px-4 py-3 border-b border-line flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-ink">{formatPhone(phone)}</p>
                {people.length > 1 && (
                  <Badge tone="info">{people.length} family members</Badge>
                )}
              </div>
              <div className="p-4 space-y-4">
                {people.map((p, i) => (
                  <div key={p.id} className={cn(
                    "flex items-start gap-3 transition-colors rounded-xl p-2 -m-2 hover:bg-surface-sunken/50",
                    i !== 0 && "pl-6 relative before:absolute before:left-2 before:top-0 before:bottom-0 before:w-px before:bg-line"
                  )}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{p.full_name}</p>
                        {p.is_blocked && <Badge tone="bad" className="text-[10px] py-0 px-1.5">Blocked</Badge>}
                      </div>
                      <p className="truncate text-xs text-ink-subtle">
                        {p.approx_age_years ? `${p.approx_age_years} yrs · ` : ""}
                        {LANGUAGE_LABEL[p.preferred_language]} · since{" "}
                        {formatDate(p.created_at)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="message"
                      onClick={() => setLinkFor(p)}
                      className="shrink-0"
                    >
                      Link
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
      variant="slide-over"
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
        <div className="space-y-6">
          <div className="rounded-2xl border border-line bg-surface-raised p-6 shadow-card ring-1 ring-brand-500/20 text-center">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-brand-700 mb-3">Secure Access Link</span>
            <p className="break-all font-mono text-sm text-ink mb-6">{issued.url}</p>
            <Button
              variant="secondary"
              className="w-full"
              icon={copied ? "check" : "edit"}
              onClick={async () => {
                await navigator.clipboard.writeText(issued.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied to clipboard" : "Copy link"}
            </Button>
          </div>
          <div className="flex items-start gap-3 rounded-2xl bg-accent-amber/5 p-4 border border-accent-amber/20">
            <Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" />
            <p className="text-xs leading-relaxed text-ink-subtle">
              This link is a secure credential. Anyone with this link can manage this patient&rsquo;s appointments.
              Send it only to <strong className="text-ink">{formatPhone(patient.phone_e164)}</strong>.
              Expires {formatDate(issued.expires_at)}.
            </p>
          </div>
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
