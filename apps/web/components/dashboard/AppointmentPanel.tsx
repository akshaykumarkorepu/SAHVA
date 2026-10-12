"use client";

import Link from "next/link";
import type { TodayAppointment } from "@/lib/types";
import { post } from "@/lib/api";
import { useMutation } from "@/lib/hooks";
import { appointmentStatus, formatPhone, formatTime } from "@/lib/format";
import { bookingSource } from "@/lib/today";
import { Badge, Button, Modal } from "@/components/ui";
import { Icon } from "@/components/icons";
import { toast } from "sonner";

/**
 * One appointment, beside the day it belongs to.
 *
 * Holds the two actions a front desk does all day — check in, mark done —
 * and a call button. Cancelling stays in the diary, behind its own step:
 * it is the one action here a patient cannot undo by turning up.
 */
export function AppointmentPanel({
  appointment: a,
  tz,
  onClose,
}: {
  appointment: TodayAppointment | null;
  tz?: string;
  onClose: () => void;
}) {
  const setStatus = useMutation((id: string, status: "checked_in" | "completed") =>
    post(`/appointments/${id}/status`, { status }),
  );

  if (!a) return null;

  const st = appointmentStatus(a.status!);
  const src = bookingSource(a.source);
  const open = a.status === "booked" || a.status === "confirmed" || a.status === "checked_in";

  async function change(status: "checked_in" | "completed") {
    const ok = await setStatus.run(a!.id!, status);
    // Say what actually happened. A failed write must not read as done.
    if (ok === null) {
      toast.error("That did not save. Try again.");
      return;
    }
    toast.success(status === "checked_in" ? `${a!.patient_name} checked in` : `${a!.patient_name} marked done`);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      variant="slide-over"
      title={a.patient_name ?? "Appointment"}
      description={`${a.starts_at ? formatTime(a.starts_at, tz) : "—"} with ${a.doctor_name}`}
      footer={
        open ? (
          <>
            {a.status !== "checked_in" && (
              <Button variant="secondary" disabled={setStatus.pending} onClick={() => void change("checked_in")}>
                Check in
              </Button>
            )}
            <Button icon="check" loading={setStatus.pending} onClick={() => void change("completed")}>
              Mark done
            </Button>
          </>
        ) : undefined
      }
    >
      <dl className="space-y-4 pb-4 text-sm">
        <Field label="Status">
          <Badge tone={st.tone}>{st.label}</Badge>
        </Field>
        {a.token_number != null && <Field label="Token">{a.token_number}</Field>}
        <Field label="Booked via">
          <span className="inline-flex items-center gap-1.5">
            <Icon name={src.icon} className="h-3.5 w-3.5 text-ink-subtle" />
            {src.label}
          </span>
        </Field>
        {a.reason && <Field label="Reason">{a.reason}</Field>}
        <Field label="Phone">
          {a.phone_e164 ? (
            <a href={`tel:${a.phone_e164}`} className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">
              <Icon name="calls" className="h-3.5 w-3.5" />
              {formatPhone(a.phone_e164)}
            </a>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Language">{a.preferred_language === "te" ? "Telugu" : a.preferred_language === "hi" ? "Hindi" : "English"}</Field>
      </dl>
      <Link
        href="/dashboard/appointments"
        className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline"
      >
        Reschedule or cancel in the diary
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
      </Link>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
