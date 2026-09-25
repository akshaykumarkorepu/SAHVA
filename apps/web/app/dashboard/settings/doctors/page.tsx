"use client";

import * as React from "react";
import { useApi, useMutation } from "@/lib/hooks";
import { post, patch, del } from "@/lib/api";
import type { Doctor } from "@/lib/types";
import type { Tables } from "@sahva/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
} from "@/components/ui";
import { rupees } from "@/lib/format";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LANGS = [
  { code: "te", label: "Telugu" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
] as const;

export default function DoctorsSettingsPage() {
  const doctors = useApi<Doctor[]>("/doctors");
  const [editing, setEditing] = React.useState<Doctor | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [scheduleFor, setScheduleFor] = React.useState<Doctor | null>(null);

  if (doctors.loading) return <Spinner />;
  if (doctors.error) return <ErrorState error={doctors.error} onRetry={doctors.reload} />;

  const rows = doctors.data ?? [];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)}>Add doctor</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="✚"
          title="No doctors yet"
          body="The AI cannot book anything until at least one doctor has a weekly schedule."
          action={<Button onClick={() => setCreating(true)}>Add the first doctor</Button>}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex flex-wrap items-start gap-3">
                <span
                  aria-hidden
                  className="mt-1 h-3 w-3 shrink-0 rounded-full"
                  style={{ background: d.colour_hex }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink-900">{d.spoken_name}</p>
                    {!d.is_active && <Badge tone="neutral">Inactive</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {d.full_name} · {d.specialty}
                    {d.qualifications ? ` · ${d.qualifications}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {d.consult_duration_min} min · {rupees(d.consult_fee_paise)} consultation
                    {d.followup_fee_paise != null && ` · ${rupees(d.followup_fee_paise)} follow-up`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.languages.map((l) => (
                      <Badge key={l}>{l}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setScheduleFor(d)}>
                    Schedule
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(d)}>
                    Edit
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <DoctorModal
          doctor={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            doctors.reload();
          }}
        />
      )}

      {scheduleFor && (
        <ScheduleModal doctor={scheduleFor} onClose={() => setScheduleFor(null)} />
      )}
    </>
  );
}

function DoctorModal({
  doctor,
  onClose,
  onSaved,
}: {
  doctor: Doctor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = React.useState({
    full_name: doctor?.full_name ?? "",
    spoken_name: doctor?.spoken_name ?? "",
    specialty: doctor?.specialty ?? "",
    qualifications: doctor?.qualifications ?? "",
    languages: (doctor?.languages ?? ["te", "en"]) as string[],
    consult_duration_min: doctor?.consult_duration_min ?? 15,
    consult_fee_rupees: doctor?.consult_fee_paise ? doctor.consult_fee_paise / 100 : 300,
    followup_fee_rupees: doctor?.followup_fee_paise ? doctor.followup_fee_paise / 100 : 150,
    colour_hex: doctor?.colour_hex ?? "#2F6BFF",
    is_active: doctor?.is_active ?? true,
  });

  const save = useMutation(() => {
    const payload = {
      full_name: f.full_name.trim(),
      spoken_name: f.spoken_name.trim(),
      specialty: f.specialty.trim(),
      qualifications: f.qualifications.trim() || undefined,
      languages: f.languages,
      consult_duration_min: f.consult_duration_min,
      // Money is stored as integer paise; never send a float rupee amount.
      consult_fee_paise: Math.round(f.consult_fee_rupees * 100),
      followup_fee_paise: Math.round(f.followup_fee_rupees * 100),
      colour_hex: f.colour_hex,
      ...(doctor ? { is_active: f.is_active } : {}),
    };
    return doctor ? patch(`/doctors/${doctor.id}`, payload) : post("/doctors", payload);
  });

  const deactivate = useMutation(() => del(`/doctors/${doctor!.id}`));

  return (
    <Modal
      open
      onClose={onClose}
      title={doctor ? `Edit ${doctor.spoken_name}` : "Add doctor"}
      footer={
        <>
          {doctor && doctor.is_active && (
            <Button
              variant="ghost"
              disabled={deactivate.pending}
              onClick={async () => {
                await deactivate.run();
                onSaved();
              }}
            >
              Deactivate
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.pending || !f.full_name.trim() || !f.spoken_name.trim() || !f.specialty.trim()}
            onClick={async () => {
              const ok = await save.run();
              if (ok) onSaved();
            }}
          >
            {save.pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name" required hint="As it appears on records.">
          <Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder="Dr. Anitha Reddy" />
        </Field>

        <Field
          label="Spoken name"
          required
          hint="What the AI says out loud. Keep titles and degrees out of it."
        >
          <Input value={f.spoken_name} onChange={(e) => setF({ ...f, spoken_name: e.target.value })} placeholder="Dr Anitha" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Specialty" required>
            <Input value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} placeholder="General Physician" />
          </Field>
          <Field label="Qualifications">
            <Input value={f.qualifications} onChange={(e) => setF({ ...f, qualifications: e.target.value })} placeholder="MBBS, MD" />
          </Field>
        </div>

        <Field label="Languages spoken" required>
          <div className="flex flex-wrap gap-2">
            {LANGS.map((l) => {
              const on = f.languages.includes(l.code);
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() =>
                    setF({
                      ...f,
                      languages: on
                        ? f.languages.filter((x) => x !== l.code)
                        : [...f.languages, l.code],
                    })
                  }
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    on
                      ? "border-primary-600 bg-primary-50 font-medium text-primary-700"
                      : "border-ink-300 text-ink-700 hover:bg-ink-100"
                  }`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Slot length (min)" required>
            <Input
              type="number"
              min={5}
              max={120}
              value={f.consult_duration_min}
              onChange={(e) => setF({ ...f, consult_duration_min: Number(e.target.value) })}
            />
          </Field>
          <Field label="Consultation ₹" hint="The AI quotes this.">
            <Input
              type="number"
              min={0}
              value={f.consult_fee_rupees}
              onChange={(e) => setF({ ...f, consult_fee_rupees: Number(e.target.value) })}
            />
          </Field>
          <Field label="Follow-up ₹">
            <Input
              type="number"
              min={0}
              value={f.followup_fee_rupees}
              onChange={(e) => setF({ ...f, followup_fee_rupees: Number(e.target.value) })}
            />
          </Field>
        </div>

        <Field label="Calendar colour">
          <input
            type="color"
            value={f.colour_hex}
            onChange={(e) => setF({ ...f, colour_hex: e.target.value })}
            className="h-10 w-20 cursor-pointer rounded-lg border border-ink-300"
          />
        </Field>

        {save.error && <ErrorState error={save.error} />}
        {deactivate.error && <ErrorState error={deactivate.error} />}
      </div>
    </Modal>
  );
}

/**
 * Weekly consulting blocks. This is what availability is computed from — if a
 * doctor has no sessions, the AI correctly tells every caller there is nothing
 * free, which is the single most confusing thing to debug without this screen.
 */
function ScheduleModal({ doctor, onClose }: { doctor: Doctor; onClose: () => void }) {
  const sessions = useApi<Tables<"doctor_sessions">[]>(`/doctors/${doctor.id}/sessions`);
  const [day, setDay] = React.useState(1);
  const [from, setFrom] = React.useState("09:00");
  const [to, setTo] = React.useState("13:00");
  const [label, setLabel] = React.useState("Morning");

  const add = useMutation(() =>
    post(`/doctors/${doctor.id}/sessions`, {
      day_of_week: day,
      starts_at: from,
      ends_at: to,
      label: label.trim() || undefined,
    }),
  );
  const remove = useMutation((id: string) => del(`/doctors/sessions/${id}`));

  const byDay = new Map<number, Tables<"doctor_sessions">[]>();
  for (const s of sessions.data ?? []) {
    byDay.set(s.day_of_week, [...(byDay.get(s.day_of_week) ?? []), s]);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${doctor.spoken_name} — weekly schedule`}
      footer={
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-ink-500">
          Availability is computed from these blocks on every call. Add two blocks for a split
          shift.
        </p>

        {sessions.loading ? (
          <Spinner />
        ) : (sessions.data ?? []).length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            No sessions yet — the AI will tell callers this doctor has nothing available.
          </p>
        ) : (
          <div className="divide-y divide-ink-100 rounded-lg border border-ink-100">
            {DAYS.map((name, i) => {
              const blocks = byDay.get(i) ?? [];
              if (blocks.length === 0) return null;
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <span className="w-24 shrink-0 text-sm font-medium text-ink-900">{name}</span>
                  <div className="flex flex-1 flex-wrap gap-2">
                    {blocks.map((b) => (
                      <span
                        key={b.id}
                        className="inline-flex items-center gap-2 rounded-lg bg-ink-100 px-2.5 py-1 text-xs text-ink-700"
                      >
                        {b.starts_at.slice(0, 5)}–{b.ends_at.slice(0, 5)}
                        {b.label ? ` · ${b.label}` : ""}
                        <button
                          aria-label="Remove block"
                          className="text-ink-500 hover:text-rose-600"
                          onClick={async () => {
                            await remove.run(b.id);
                            sessions.reload();
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-lg border border-ink-100 p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Add a block
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Day">
              <Select value={day} onChange={(e) => setDay(Number(e.target.value))}>
                {DAYS.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Label">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Morning" />
            </Field>
            <Field label="From">
              <Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Until">
              <Input type="time" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>

          {add.error && (
            <div className="mt-3">
              <ErrorState error={add.error} />
            </div>
          )}

          <Button
            className="mt-3 w-full"
            disabled={add.pending || to <= from}
            onClick={async () => {
              const ok = await add.run();
              if (ok) sessions.reload();
            }}
          >
            {add.pending ? "Adding…" : "Add block"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
