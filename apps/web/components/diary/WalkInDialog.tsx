"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, post } from "@/lib/api";
import type { Appointment, Doctor } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { toIndianE164 } from "@/lib/phone";
import { Button, Field, Input, Modal, Select } from "@/components/ui";

/**
 * Walk-in fast pass.
 *
 * Built for the counter at nine in the morning: name, number, Enter. The
 * server picks the doctor's next genuinely free slot today and the token comes
 * back large enough to read out. "Next walk-in" clears the form but keeps the
 * doctor, because walk-ins come in runs for the same doctor.
 */
export function WalkInDialog({
  open,
  onClose,
  doctors,
  tz,
}: {
  open: boolean;
  onClose: () => void;
  doctors: Doctor[];
  tz?: string;
}) {
  const client = useQueryClient();
  const [doctorId, setDoctorId] = React.useState("");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<Appointment | null>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open && !doctorId && doctors.length > 0) setDoctorId(doctors[0].id);
  }, [open, doctorId, doctors]);

  const e164 = toIndianE164(phone);
  const ready = name.trim().length >= 2 && e164 !== null && !!doctorId;
  const doctor = doctors.find((d) => d.id === doctorId);

  function next() {
    setIssued(null);
    setName("");
    setPhone("");
    setError(null);
    setTimeout(() => nameRef.current?.focus(), 0);
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    try {
      const appt = await post<Appointment>("/appointments/walk-in", {
        doctor_id: doctorId,
        patient_name: name.trim(),
        phone: e164,
      });
      void client.invalidateQueries({ queryKey: ["api"] });
      setIssued(appt);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "NO_SLOT_TODAY"
          ? `${doctor?.spoken_name ?? "This doctor"} has no free time left today.`
          : err instanceof Error
            ? err.message
            : "That did not save.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        next();
        onClose();
      }}
      title={issued ? "Token issued" : "Walk-in"}
      description={issued ? undefined : "Next free time with the doctor, today."}
      footer={
        issued ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
            <Button icon="plus" onClick={next}>
              Next walk-in
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={pending} disabled={!ready} onClick={() => void submit()}>
              Give token
            </Button>
          </>
        )
      }
    >
      {issued ? (
        <div className="pb-4 text-center" role="status">
          <p className="text-sm text-ink-muted">{name}</p>
          <p className="mt-1 font-display text-[64px] font-bold leading-none tracking-tight text-brand-700">
            {issued.token_number ?? "—"}
          </p>
          <p className="mt-2 text-sm font-medium text-ink">
            {formatTime(issued.starts_at, tz)} with {doctor?.spoken_name}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 pb-2">
          <Field label="Patient name" required>
            <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ramu" />
          </Field>
          <Field label="Mobile" required hint={phone && !e164 ? "A 10-digit mobile number, like 98765 43210." : undefined}>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              inputMode="tel"
            />
          </Field>
          {/* Last, and kept between walk-ins: the modal focuses the first
              field, and the name is what changes every time. */}
          <Field label="Doctor" required>
            <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.spoken_name} — {d.specialty}
                </option>
              ))}
            </Select>
          </Field>
          {error && (
            <p role="alert" className="rounded-lg bg-accent-rose/[0.07] px-3 py-2 text-sm text-ink">
              {error}
            </p>
          )}
          {/* Enter submits from either field. */}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      )}
    </Modal>
  );
}
