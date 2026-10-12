"use client";

import type { Appointment, Doctor, Patient } from "@/lib/types";
import { useApi } from "@/lib/hooks";
import { useCanAdminister, useSession } from "@/lib/session";
import { appointmentStatus, formatDateTime, formatPhone, LANGUAGE_LABEL } from "@/lib/format";
import { summarise } from "@/lib/patient-summary";
import { Badge, Button, ErrorState, LoadingRows, Modal, cn } from "@/components/ui";
import { Icon } from "@/components/icons";

type AccessRow = {
  id: string;
  actor_type: "staff" | "patient";
  actor_name: string;
  record_type: "medical_record" | "patient_profile";
  accessed_at: string;
};

type Detail = Patient & {
  appointments: (Appointment & { doctors: Pick<Doctor, "spoken_name" | "specialty"> | null })[];
};

/**
 * Everything a receptionist needs on one patient, beside the list.
 *
 * Appointments and contact only. Diagnoses and prescriptions are clinical
 * records with their own access rules; they do not belong in a panel any
 * staff member can open from a search result.
 */
export function PatientQuickView({
  patientId,
  family,
  onClose,
  onSendLink,
}: {
  patientId: string;
  /** Everyone registered on the same phone — one handset often covers a family. */
  family: Patient[];
  onClose: () => void;
  onSendLink: (p: Patient) => void;
}) {
  const { clinic } = useSession();
  const tz = clinic?.timezone;
  const q = useApi<Detail>(`/patients/${patientId}`, [patientId]);
  const canAudit = useCanAdminister();
  const log = useApi<AccessRow[]>(canAudit ? `/patients/${patientId}/access-log` : null, [patientId, canAudit]);
  const p = q.data;
  const s = summarise(p?.appointments ?? []);
  const others = family.filter((f) => f.id !== patientId);

  return (
    <Modal
      open
      onClose={onClose}
      variant="slide-over"
      title={p?.full_name ?? "Patient"}
      description={p ? `${formatPhone(p.phone_e164)} · ${LANGUAGE_LABEL[p.preferred_language]}` : undefined}
      footer={
        p ? (
          <>
            <a href={`tel:${p.phone_e164}`}>
              <Button variant="secondary" icon="calls">
                Call
              </Button>
            </a>
            <Button icon="message" onClick={() => onSendLink(p)}>
              Send appointment link
            </Button>
          </>
        ) : undefined
      }
    >
      {q.loading ? (
        <LoadingRows rows={3} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : p ? (
        <div className="space-y-6 pb-4">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Count label="Visits" value={s.visits} />
            <Count label="No-shows" value={s.noShows} warn={s.noShows > 0} />
            <Count label="Cancelled" value={s.cancelled} />
          </dl>

          {p.is_blocked && (
            <p className="rounded-xl bg-accent-rose/[0.07] p-3 text-sm text-ink">
              <strong>Blocked.</strong> The AI will not book for this patient.
            </p>
          )}

          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Coming up</h4>
            {s.upcoming.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing booked.</p>
            ) : (
              <ul className="space-y-2">
                {s.upcoming.map((a) => (
                  <ApptLine key={a.id} when={formatDateTime(a.starts_at, tz)} who={a.doctors?.spoken_name} status={a.status} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">History</h4>
            {s.past.length === 0 ? (
              <p className="text-sm text-ink-muted">First time with the clinic.</p>
            ) : (
              <ul className="space-y-2">
                {s.past.slice(0, 8).map((a) => (
                  <ApptLine key={a.id} when={formatDateTime(a.starts_at, tz)} who={a.doctors?.spoken_name} status={a.status} />
                ))}
              </ul>
            )}
          </section>

          {canAudit && (
            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                Who opened this record
              </h4>
              {log.loading ? (
                <LoadingRows rows={1} />
              ) : (log.data ?? []).length === 0 ? (
                <p className="text-sm text-ink-muted">Nobody yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(log.data ?? []).slice(0, 8).map((r) => (
                    <li key={r.id} className="flex justify-between gap-3">
                      <span className="truncate text-ink">
                        {r.actor_name}
                        <span className="text-ink-subtle">
                          {" "}
                          · {r.record_type === "medical_record" ? "medical record" : "profile"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-subtle">{formatDateTime(r.accessed_at, tz)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {others.length > 0 && (
            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                Same phone number
              </h4>
              <ul className="flex flex-wrap gap-2">
                {others.map((f) => (
                  <li key={f.id}>
                    <Badge tone="info">{f.full_name}</Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-subtle">
                Separate records. Confirm which person is calling before changing anything.
              </p>
            </section>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function Count({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-sunken p-3">
      <dd className={cn("font-display text-xl font-semibold", warn ? "text-accent-amber" : "text-ink")}>{value}</dd>
      <dt className="text-[11px] text-ink-subtle">{label}</dt>
    </div>
  );
}

function ApptLine({ when, who, status }: { when: string; who?: string; status: Appointment["status"] }) {
  const st = appointmentStatus(status);
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink">{when}</span>
        {who && (
          <span className="flex items-center gap-1 truncate text-xs text-ink-subtle">
            <Icon name="doctor" className="h-3 w-3" />
            {who}
          </span>
        )}
      </span>
      <Badge tone={st.tone}>{st.label}</Badge>
    </li>
  );
}
