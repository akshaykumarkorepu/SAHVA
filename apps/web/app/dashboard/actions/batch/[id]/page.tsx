"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useApi, useMutation } from "@/lib/hooks";
import { ApiError, post } from "@/lib/api";
import type { RescheduleBatch, Slot } from "@/lib/types";
import { useSession } from "@/lib/session";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingRows, Modal, PageHeader, cn } from "@/components/ui";
import { Icon } from "@/components/icons";
import { addDaysIso, formatDate, formatDateTime, formatPhone, formatTime, LANGUAGE_LABEL } from "@/lib/format";
import { STEPS, canContact, currentStep, itemStage, messageState, progress } from "@/lib/batch";

type Item = RescheduleBatch["items"][number];

/**
 * Reschedule review — the trust flow, end to end.
 *
 * The database opened this batch in DRAFT when a doctor was marked unavailable.
 * Nothing has been sent and nobody has been cancelled. A named person approves
 * it (a CHECK constraint refuses the transition without one), then the front
 * desk works through the patients: rebook, or record that they were told or
 * could not be reached. The database marks a patient rebooked only when the
 * appointment actually moves, and closes the batch when nobody is left.
 *
 * Every status on this page is what the database holds. Nothing here says a
 * patient was messaged unless a message exists and says so.
 */
export default function BatchPage({ params }: { params: { id: string } }) {
  const { clinic, email } = useSession();
  const tz = clinic?.timezone;
  const { data, error, loading, reload } = useApi<RescheduleBatch>(`/actions/batches/${params.id}`);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rebooking, setRebooking] = React.useState<Item | null>(null);
  const approve = useMutation(() => post(`/actions/batches/${params.id}/dispatch`));
  const mark = useMutation((itemId: string, status: "notified" | "unreachable") =>
    post(`/actions/batch-items/${itemId}/status`, { status }),
  );

  if (loading) return <LoadingRows rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const doctor = data.doctors?.spoken_name ?? "The doctor";
  const step = currentStep(data.status);
  const { handled, total } = progress(data.items);
  const anyMessage = data.items.some((i) => i.message);

  async function onMark(item: Item, status: "notified" | "unreachable") {
    const ok = await mark.run(item.id, status);
    if (ok === null) {
      toast.error("That did not save. Try again.");
      return;
    }
    reload();
  }

  return (
    <>
      <PageHeader
        eyebrow="Action Required"
        title={`Reschedule ${doctor}'s patients`}
        subtitle={`${doctor} is unavailable ${formatDateTime(data.window_start, tz)} – ${formatTime(
          data.window_end,
          tz,
        )}${data.reason_note ? ` · ${data.reason_note}` : ""}`}
        action={
          <Link href="/dashboard/actions">
            <Button variant="ghost" icon="chevronLeft">
              Queue
            </Button>
          </Link>
        }
      />

      <Stepper step={step} />

      {data.status === "draft" && (
        <Banner tone="warn" icon="shield" title="Nothing has been sent, and nobody has been cancelled.">
          These {total} patients still hold their original slot, marked as needing a new one. Check the list,
          then approve. Approving is recorded against your account.
        </Banner>
      )}

      {data.status === "notifying" && (
        <Banner
          tone="info"
          icon="calls"
          title={`Approved ${data.dispatched_at ? formatDateTime(data.dispatched_at, tz) : ""} · ${handled} of ${total} handled`}
        >
          {anyMessage
            ? "Message status is shown for each patient as WhatsApp reports it."
            : "No message has gone out for this batch — SAHVA does not send WhatsApp messages yet. Call each patient below, then rebook them or record what happened."}
        </Banner>
      )}

      {data.status === "completed" && (
        <Banner tone="good" icon="success" title="Every patient has been handled.">
          {data.rebooked_count} rebooked. The Action Required item closed itself.
        </Banner>
      )}

      {data.items.length === 0 ? (
        <EmptyState icon="patients" title="No patients in this batch" body="Nobody had an appointment in that window." />
      ) : (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <PatientRow
              key={item.id}
              item={item}
              tz={tz}
              batchStatus={data.status}
              busy={mark.pending}
              onRebook={() => setRebooking(item)}
              onMark={(s) => void onMark(item, s)}
            />
          ))}
        </ul>
      )}

      {data.status === "draft" && data.items.length > 0 && (
        <div className="sticky bottom-24 mt-6 flex justify-end lg:bottom-6">
          <Button size="lg" icon="check" onClick={() => setApproveOpen(true)}>
            Approve rescheduling {total}
          </Button>
        </div>
      )}

      <Modal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title={`Approve rescheduling ${total} patient${total === 1 ? "" : "s"}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproveOpen(false)}>
              Not yet
            </Button>
            <Button
              loading={approve.pending}
              onClick={async () => {
                const ok = await approve.run();
                setApproveOpen(false);
                if (ok === null) {
                  toast.error("Approval did not save. Reload and try again.");
                  return;
                }
                toast.success("Approved. Now contact each patient.");
                reload();
              }}
            >
              Approve
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-muted">
          This records <span className="font-medium text-ink">{email}</span> as the person who decided these
          patients need moving. It cannot be undone.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          No message is sent automatically yet. After approving, call each patient from this page and rebook them.
          Nobody is cancelled.
        </p>
      </Modal>

      {rebooking && (
        <RebookModal
          item={rebooking}
          doctorId={data.doctor_id}
          tz={tz}
          defaultDate={dateIn(data.window_end, tz)}
          onClose={() => setRebooking(null)}
          onDone={() => {
            setRebooking(null);
            reload();
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-5 grid grid-cols-4 gap-2" aria-label="Progress">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} aria-current={current ? "step" : undefined}>
            <span className={cn("block h-1.5 rounded-full", done || current ? "bg-brand-600" : "bg-line")} />
            <span
              className={cn(
                "mt-2 flex items-center gap-1 text-[11px] font-medium sm:text-xs",
                current ? "text-ink" : done ? "text-brand-700" : "text-ink-subtle",
              )}
            >
              {done && <Icon name="check" className="h-3 w-3 shrink-0" />}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Banner({
  tone,
  icon,
  title,
  children,
}: {
  tone: "warn" | "info" | "good";
  icon: "shield" | "calls" | "success";
  title: string;
  children: React.ReactNode;
}) {
  const styles = {
    warn: "border-accent-amber/30 bg-accent-amber/[0.07]",
    info: "border-accent-sky/30 bg-accent-sky/[0.06]",
    good: "border-brand-500/30 bg-brand-500/[0.07]",
  }[tone];
  const iconColour = { warn: "text-accent-amber", info: "text-accent-sky", good: "text-brand-700" }[tone];
  return (
    <div role="status" className={cn("mb-5 flex gap-3 rounded-2xl border p-4", styles)}>
      <Icon name={icon} className={cn("mt-0.5 h-5 w-5 shrink-0", iconColour)} />
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{children}</p>
      </div>
    </div>
  );
}

function PatientRow({
  item,
  tz,
  batchStatus,
  busy,
  onRebook,
  onMark,
}: {
  item: Item;
  tz?: string;
  batchStatus: string;
  busy: boolean;
  onRebook: () => void;
  onMark: (s: "notified" | "unreachable") => void;
}) {
  const stage = itemStage(item.status);
  const msg = messageState(item.message);
  const p = item.patients;
  const active = canContact(batchStatus, item.status);

  return (
    <li>
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-ink">{p?.full_name ?? "—"}</p>
            <p className="mt-0.5 text-xs text-ink-subtle">
              {p?.phone_e164 ? (
                <a href={`tel:${p.phone_e164}`} className="font-medium text-brand-700 hover:underline">
                  {formatPhone(p.phone_e164)}
                </a>
              ) : (
                "No phone"
              )}
              {p ? ` · ${LANGUAGE_LABEL[p.preferred_language]}` : ""}
            </p>
          </div>
          <Badge tone={stage.tone}>{stage.label}</Badge>
        </div>

        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-subtle">Was</dt>
            <dd className={cn("text-ink", item.status === "rebooked" && "text-ink-subtle line-through")}>
              {item.appointments ? formatDateTime(item.appointments.starts_at, tz) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-subtle">Now</dt>
            <dd className="text-ink">
              {item.new_appointment ? (
                <span className="font-medium text-brand-700">{formatDateTime(item.new_appointment.starts_at, tz)}</span>
              ) : (
                "Not rebooked"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-subtle">Message</dt>
            <dd className="flex items-center gap-1.5" title={msg.detail}>
              <Badge tone={msg.tone}>{msg.label}</Badge>
            </dd>
          </div>
        </dl>

        {active && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
            <Button size="sm" icon="appointments" onClick={onRebook}>
              Rebook
            </Button>
            {item.status === "pending" && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onMark("notified")}>
                Told by phone
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onMark("unreachable")}>
              Couldn&rsquo;t reach
            </Button>
          </div>
        )}
      </Card>
    </li>
  );
}

/**
 * Pick a new time from live availability — the same RPC the voice agent uses,
 * never computed here. If the slot goes between seeing it and choosing it, say
 * so and refresh the list rather than showing a generic error.
 */
function RebookModal({
  item,
  doctorId,
  tz,
  defaultDate,
  onClose,
  onDone,
}: {
  item: Item;
  doctorId: string;
  tz?: string;
  defaultDate: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = React.useState(defaultDate);
  const slots = useApi<Slot[]>(`/doctors/${doctorId}/availability?date=${date}`, [date]);
  const client = useQueryClient();
  const [pending, setPending] = React.useState(false);

  // Plain try/catch rather than useMutation: the branch below needs this
  // call's own error, and a hook's error state is only readable next render.
  async function choose(s: Slot) {
    setPending(true);
    try {
      await post(`/appointments/${item.appointment_id}/reschedule`, { new_starts_at: s.slot_start });
      void client.invalidateQueries({ queryKey: ["api"] });
      toast.success(`${item.patients?.full_name ?? "Patient"} rebooked for ${formatDateTime(s.slot_start, tz)}`);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.isSlotTaken) {
        toast.error("That time was just taken by someone else. Pick another.");
        slots.reload();
      } else {
        toast.error(e instanceof Error ? e.message : "The rebooking did not save.");
      }
    } finally {
      setPending(false);
    }
  }

  const list = slots.data ?? [];

  return (
    <Modal open onClose={onClose} title={`Rebook ${item.patients?.full_name ?? "patient"}`} description="Free times, live from the diary.">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" icon="chevronLeft" onClick={() => setDate(addDaysIso(date, -1))} aria-label="Previous day" />
        <p className="text-sm font-medium text-ink">{formatDate(`${date}T12:00:00Z`, tz)}</p>
        <Button size="sm" variant="ghost" iconRight="chevronRight" onClick={() => setDate(addDaysIso(date, 1))} aria-label="Next day" />
      </div>
      {slots.loading ? (
        <LoadingRows rows={2} />
      ) : slots.error ? (
        <ErrorState error={slots.error} onRetry={slots.reload} />
      ) : list.length === 0 ? (
        <p className="pb-4 text-center text-sm text-ink-muted">No free times this day. Try the next one.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 pb-4 sm:grid-cols-4">
          {list.map((s) => (
            <Button key={s.slot_start} size="sm" variant="secondary" disabled={pending} onClick={() => void choose(s)}>
              {formatTime(s.slot_start, tz)}
            </Button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** The calendar date of an instant in the clinic's timezone, as YYYY-MM-DD. */
function dateIn(iso: string, tz = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
}
