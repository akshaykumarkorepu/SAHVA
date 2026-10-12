"use client";

import * as React from "react";
import { useApi, useMutation } from "@/lib/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, post } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { AppointmentWithJoins, Doctor, Paged, Slot } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  addDaysIso,
  appointmentStatus,
  formatDate,
  formatPhone,
  formatTime,
  todayIso,
} from "@/lib/format";

export default function AppointmentsPage() {
  const { clinic } = useSession();
  const tz = clinic?.timezone;
  const [date, setDate] = React.useState(() => todayIso(tz));
  const [bookOpen, setBookOpen] = React.useState(false);
  const [timeOffOpen, setTimeOffOpen] = React.useState(false);

  const from = `${date}T00:00:00+05:30`;
  const to = `${date}T23:59:59+05:30`;
  const list = useApi<Paged<AppointmentWithJoins>>(
    `/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=200`,
    [date],
  );
  const doctors = useApi<Doctor[]>("/doctors");

  return (
    <>
      <PageHeader
        title="Appointments"
        subtitle="Book, reschedule and run the day."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setTimeOffOpen(true)}>
              Mark doctor unavailable
            </Button>
            <Button onClick={() => setBookOpen(true)}>Book appointment</Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 bg-surface-raised p-2 rounded-2xl border border-line w-fit shadow-xs">
        <Button variant="secondary" size="sm" onClick={() => setDate((d) => addDaysIso(d, -1))}>
          <Icon name="chevronLeft" className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto font-medium text-sm focus:ring-brand-500/20"
        />
        <Button variant="secondary" size="sm" onClick={() => setDate((d) => addDaysIso(d, 1))}>
          <Icon name="chevronRight" className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-4 w-px bg-line" />
        <Button variant="ghost" size="sm" onClick={() => setDate(todayIso(tz))}>
          Today
        </Button>
      </div>

      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (list.data?.data ?? []).length === 0 ? (
        <EmptyState
          icon="appointments"
          title={`Nothing booked for ${formatDate(`${date}T09:00:00+05:30`, tz)}`}
          body="Appointments booked by the AI receptionist appear here automatically."
          action={<Button onClick={() => setBookOpen(true)}>Book appointment</Button>}
        />
      ) : (
        <div className="grid gap-3">
          {(list.data?.data ?? []).map((a) => (
            <AppointmentRow key={a.id} appointment={a} tz={tz} onChanged={list.reload} />
          ))}
        </div>
      )}

      <BookModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        doctors={doctors.data ?? []}
        defaultDate={date}
        tz={tz}
        onBooked={() => {
          setBookOpen(false);
          list.reload();
        }}
      />

      <TimeOffModal
        open={timeOffOpen}
        onClose={() => setTimeOffOpen(false)}
        doctors={doctors.data ?? []}
        onDone={() => {
          setTimeOffOpen(false);
          list.reload();
        }}
      />
    </>
  );
}

function AppointmentRow({
  appointment: a,
  tz,
  onChanged,
}: {
  appointment: AppointmentWithJoins;
  tz?: string;
  onChanged: () => void;
}) {
  const st = appointmentStatus(a.status);
  const setStatus = useMutation((status: string) =>
    post(`/appointments/${a.id}/status`, { status }),
  );
  const cancel = useMutation(() => post(`/appointments/${a.id}/cancel`, {}));
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  // A failed write used to refresh the row as if it had worked.
  async function change(status: "checked_in" | "completed") {
    const ok = await setStatus.run(status);
    if (ok === null) toast.error("That did not save. Try again.");
    else toast.success(status === "checked_in" ? "Checked in" : "Marked done");
    onChanged();
  }

  const live = a.status === "booked" || a.status === "confirmed" || a.status === "checked_in";

  return (
    <div className="px-4 py-3 transition hover:bg-surface-sunken/50">
      <div className="flex items-center gap-3">
        <span className="w-[68px] shrink-0 font-display text-sm font-semibold tabular-nums text-ink">
          {formatTime(a.starts_at, tz)}
        </span>
        <span
          aria-hidden
          className="h-8 w-1 shrink-0 rounded-full"
          style={{ background: a.doctors?.colour_hex ?? "rgb(5 150 105)" }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {a.patients?.full_name ?? "—"}
          </p>
          <p className="truncate text-xs text-ink-subtle">
            {a.doctors?.spoken_name} · {formatPhone(a.patients?.phone_e164 ?? null)}
            {a.reason ? ` · ${a.reason}` : ""}
          </p>
        </div>

        <Badge tone={st.tone}>{st.label}</Badge>
      </div>

      {live && (
        <div className="mt-2.5 flex gap-1.5 border-t border-line pt-2.5 sm:mt-0 sm:justify-end sm:border-0 sm:pt-0">
          {a.status !== "checked_in" && (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 sm:flex-none"
              disabled={setStatus.pending}
              onClick={() => void change("checked_in")}
            >
              Check in
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 sm:flex-none"
            disabled={setStatus.pending}
            onClick={() => void change("completed")}
          >
            Done
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 sm:flex-none"
            disabled={cancel.pending}
            onClick={() => setConfirmCancel(true)}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* The one action here a patient cannot undo by turning up. */}
      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={`Cancel ${a.patients?.full_name ?? "this appointment"}?`}
        description={`${formatTime(a.starts_at, tz)} with ${a.doctors?.spoken_name ?? "the doctor"}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={cancel.pending}
              onClick={async () => {
                const ok = await cancel.run();
                setConfirmCancel(false);
                if (ok === null) toast.error("The cancellation did not save.");
                else toast.success("Appointment cancelled");
                onChanged();
              }}
            >
              Cancel appointment
            </Button>
          </>
        }
      >
        <p className="pb-4 text-sm leading-relaxed text-ink-muted">
          The slot becomes free for others. The patient is not told automatically — call them if they need to
          know.
        </p>
      </Modal>
    </div>
  );
}

function BookModal({
  open,
  onClose,
  doctors,
  defaultDate,
  tz,
  onBooked,
}: {
  open: boolean;
  onClose: () => void;
  doctors: Doctor[];
  defaultDate: string;
  tz?: string;
  onBooked: () => void;
}) {
  const [doctorId, setDoctorId] = React.useState("");
  const [date, setDate] = React.useState(defaultDate);
  const [slot, setSlot] = React.useState("");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("+91");
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (open && doctors.length > 0 && !doctorId) setDoctorId(doctors[0].id);
  }, [open, doctors, doctorId]);
  React.useEffect(() => setSlot(""), [doctorId, date]);

  // Availability is always fetched live — never cached, never assumed.
  const slots = useApi<Slot[]>(
    open && doctorId ? `/doctors/${doctorId}/availability?date=${date}` : null,
    [doctorId, date, open],
  );

  const client = useQueryClient();
  const [pending, setPending] = React.useState(false);
  const [failure, setFailure] = React.useState<Error | null>(null);
  const [slotGone, setSlotGone] = React.useState(false);
  React.useEffect(() => setSlotGone(false), [doctorId, date]);

  // try/catch rather than useMutation: the slot-taken branch needs this
  // attempt's own error, which a hook only exposes on the next render.
  async function submit() {
    setPending(true);
    setFailure(null);
    setSlotGone(false);
    try {
      await post("/appointments", {
        doctor_id: doctorId,
        patient_name: name.trim(),
        phone: phone.trim(),
        starts_at: slot,
        reason: reason.trim() || undefined,
      });
      void client.invalidateQueries({ queryKey: ["api"] });
      toast.success(`${name.trim()} booked for ${formatTime(slot, tz)}`);
      // The next booking starts clean, not with this patient's details.
      setName("");
      setPhone("+91");
      setReason("");
      setSlot("");
      onBooked();
    } catch (e) {
      if (e instanceof ApiError && e.isSlotTaken) {
        // Someone else — another receptionist, or the AI on a call — got
        // there first. Keep everything typed, drop the dead slot, refresh.
        setSlotGone(true);
        setSlot("");
        slots.reload();
      } else {
        setFailure(e instanceof Error ? e : new Error(String(e)));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Book appointment"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={!slot || !name.trim() || phone.length < 10}
            onClick={() => void submit()}
          >
            Book
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Doctor" required>
          <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.spoken_name} — {d.specialty}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field
          label="Time"
          required
          hint="Only genuinely free slots are shown, computed live from the doctor's schedule."
        >
          {slotGone && (
            <p role="alert" className="mb-2 rounded-lg bg-accent-amber/[0.08] px-3 py-2 text-sm text-ink">
              That time was just booked by someone else. Pick another — the list below is fresh.
            </p>
          )}
          {slots.loading ? (
            <p className="text-sm text-ink-subtle">Checking availability…</p>
          ) : (slots.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-subtle">
              No free slots — the doctor may not consult on this day.
            </p>
          ) : (
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {(slots.data ?? []).map((s) => (
                <button
                  key={s.slot_start}
                  type="button"
                  onClick={() => setSlot(s.slot_start)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    slot === s.slot_start
                      ? "border-brand-600 bg-brand-50 font-medium text-brand-700"
                      : "border-line-strong text-ink-muted hover:bg-surface-sunken"
                  }`}
                >
                  {formatTime(s.slot_start, tz)}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Patient name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lakshmi Devi" />
        </Field>

        <Field
          label="Phone"
          required
          hint="One number can cover a family — the name is what identifies the patient."
        >
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919885512345" />
        </Field>

        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Fever, follow-up…" />
        </Field>

        {failure && <ErrorState error={failure} />}
      </div>
    </Modal>
  );
}

/**
 * Marking a doctor unavailable is the entry point to the trust flow: the
 * database flags affected appointments and opens a DRAFT batch. This modal
 * says so plainly, because staff need to know nobody has been cancelled.
 */
function TimeOffModal({
  open,
  onClose,
  doctors,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  doctors: Doctor[];
  onDone: () => void;
}) {
  const [doctorId, setDoctorId] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [kind, setKind] = React.useState("leave");
  const [reason, setReason] = React.useState("");
  const [result, setResult] = React.useState<{ batch: { id: string; total_affected: number } | null } | null>(null);

  React.useEffect(() => {
    if (open && doctors.length > 0 && !doctorId) setDoctorId(doctors[0].id);
    if (!open) setResult(null);
  }, [open, doctors, doctorId]);

  const submit = useMutation(() =>
    post<{ batch: { id: string; total_affected: number } | null }>("/doctors/time-off", {
      doctor_id: doctorId,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      kind,
      reason: reason.trim() || undefined,
    }),
  );

  if (result) {
    const affected = result.batch?.total_affected ?? 0;
    return (
      <Modal
        open={open}
        onClose={() => {
          setResult(null);
          onDone();
        }}
        title="Doctor marked unavailable"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                onDone();
              }}
            >
              Close
            </Button>
            {affected > 0 && result.batch && (
              <a href={`/dashboard/actions/batch/${result.batch.id}`}>
                <Button>Review {affected} patient{affected === 1 ? "" : "s"}</Button>
              </a>
            )}
          </>
        }
      >
        {affected === 0 ? (
          <p className="text-sm text-ink-muted">No appointments fell in that window.</p>
        ) : (
          <>
            <p className="text-sm font-medium text-ink">
              {affected} appointment{affected === 1 ? " was" : "s were"} flagged for rescheduling.
            </p>
            <p className="mt-2 text-sm text-ink-subtle">
              Nobody has been cancelled and no message has been sent. The patients still hold
              their slots until someone reviews the list and sends the reschedule messages.
            </p>
          </>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark doctor unavailable"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={submit.pending || !doctorId || !startsAt || !endsAt}
            onClick={async () => {
              const r = await submit.run();
              if (r) setResult(r);
            }}
          >
            {submit.pending ? "Saving…" : "Mark unavailable"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-sunken/60 px-3 py-2.5 text-xs text-ink-muted">
          This flags affected appointments for review. It does <strong>not</strong> cancel
          anyone and does <strong>not</strong> message patients.
        </div>

        <Field label="Doctor" required>
          <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.spoken_name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" required>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Until" required>
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>

        <Field label="Reason">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="leave">Leave</option>
            <option value="emergency">Emergency</option>
            <option value="conference">Conference</option>
            <option value="hours_change">Hours changed</option>
          </Select>
        </Field>

        <Field label="Note">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Called to district hospital" />
        </Field>

        {submit.error && <ErrorState error={submit.error} />}
      </div>
    </Modal>
  );
}
