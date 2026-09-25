"use client";

import * as React from "react";
import { useApi, useMutation } from "@/lib/hooks";
import { post, del } from "@/lib/api";
import type { Tables } from "@sahva/types";
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Select,
  Spinner,
} from "@/components/ui";
import { formatDate } from "@/lib/format";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function HoursSettingsPage() {
  const hours = useApi<Tables<"clinic_hours">[]>("/clinic/hours");
  const closures = useApi<Tables<"clinic_closures">[]>("/clinic/closures");

  return (
    <div className="space-y-6">
      <OperatingHours hours={hours} />
      <Closures closures={closures} />
    </div>
  );
}

function OperatingHours({ hours }: { hours: ReturnType<typeof useApi<Tables<"clinic_hours">[]>> }) {
  const [day, setDay] = React.useState(1);
  const [opens, setOpens] = React.useState("09:00");
  const [closes, setCloses] = React.useState("13:00");
  const [label, setLabel] = React.useState("Morning");

  const add = useMutation(() =>
    post("/clinic/hours", {
      day_of_week: day,
      opens_at: opens,
      closes_at: closes,
      label: label.trim() || undefined,
    }),
  );
  const remove = useMutation((id: string) => del(`/clinic/hours/${id}`));

  const byDay = new Map<number, Tables<"clinic_hours">[]>();
  for (const h of hours.data ?? []) {
    byDay.set(h.day_of_week, [...(byDay.get(h.day_of_week) ?? []), h]);
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-ink-900">Operating hours</h3>
      <p className="mb-4 text-xs text-ink-500">
        When the clinic is open, independent of which doctor is sitting. The AI answers
        &ldquo;are you open?&rdquo; from here, and a call outside these hours counts as a
        recovered missed call.
      </p>

      {hours.loading ? (
        <Spinner />
      ) : hours.error ? (
        <ErrorState error={hours.error} onRetry={hours.reload} />
      ) : (
        <div className="divide-y divide-ink-100 rounded-lg border border-ink-100">
          {DAYS.map((name, i) => {
            const blocks = byDay.get(i) ?? [];
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <span className="w-24 shrink-0 text-sm font-medium text-ink-900">{name}</span>
                {blocks.length === 0 ? (
                  <span className="text-sm text-ink-500">Closed</span>
                ) : (
                  <div className="flex flex-1 flex-wrap gap-2">
                    {blocks.map((b) => (
                      <span
                        key={b.id}
                        className="inline-flex items-center gap-2 rounded-lg bg-ink-100 px-2.5 py-1 text-xs text-ink-700"
                      >
                        {b.opens_at.slice(0, 5)}–{b.closes_at.slice(0, 5)}
                        {b.label ? ` · ${b.label}` : ""}
                        <button
                          aria-label="Remove block"
                          className="text-ink-500 hover:text-rose-600"
                          onClick={async () => {
                            await remove.run(b.id);
                            hours.reload();
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Field label="Day">
          <Select value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Opens">
          <Input type="time" value={opens} onChange={(e) => setOpens(e.target.value)} />
        </Field>
        <Field label="Closes">
          <Input type="time" value={closes} onChange={(e) => setCloses(e.target.value)} />
        </Field>
        <Field label="Label">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Morning" />
        </Field>
      </div>

      {add.error && (
        <div className="mt-3">
          <ErrorState error={add.error} />
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Button
          disabled={add.pending || closes <= opens}
          onClick={async () => {
            const ok = await add.run();
            if (ok) hours.reload();
          }}
        >
          {add.pending ? "Adding…" : "Add hours"}
        </Button>
      </div>
    </Card>
  );
}

function Closures({
  closures,
}: {
  closures: ReturnType<typeof useApi<Tables<"clinic_closures">[]>>;
}) {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [reason, setReason] = React.useState("");

  const add = useMutation(() =>
    post("/clinic/closures", { starts_on: from, ends_on: to || from, reason: reason.trim() }),
  );
  const remove = useMutation((id: string) => del(`/clinic/closures/${id}`));

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-ink-900">Holidays and closures</h3>
      <p className="mb-4 text-xs text-ink-500">
        Sankranti, festivals, doctor travel. Slot generation subtracts these before offering any
        time, so the AI will never book a patient into a closed day.
      </p>

      {closures.loading ? (
        <Spinner />
      ) : (closures.data ?? []).length === 0 ? (
        <p className="rounded-lg bg-ink-100/60 px-3 py-2.5 text-sm text-ink-500">
          No upcoming closures.
        </p>
      ) : (
        <div className="divide-y divide-ink-100 rounded-lg border border-ink-100">
          {(closures.data ?? []).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">{c.reason}</p>
                <p className="text-xs text-ink-500">
                  {formatDate(`${c.starts_on}T09:00:00+05:30`)}
                  {c.ends_on !== c.starts_on && ` → ${formatDate(`${c.ends_on}T09:00:00+05:30`)}`}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={async () => {
                  await remove.run(c.id);
                  closures.reload();
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="From" required>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Until" hint="Leave blank for a single day.">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Reason" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sankranti" />
        </Field>
      </div>

      {add.error && (
        <div className="mt-3">
          <ErrorState error={add.error} />
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Button
          disabled={add.pending || !from || reason.trim().length < 2}
          onClick={async () => {
            const ok = await add.run();
            if (ok) {
              setReason("");
              closures.reload();
            }
          }}
        >
          {add.pending ? "Adding…" : "Add closure"}
        </Button>
      </div>
    </Card>
  );
}
