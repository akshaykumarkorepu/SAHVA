"use client";

import * as React from "react";
import { useApi, useMutation } from "@/lib/hooks";
import { patch } from "@/lib/api";
import type { Tables } from "@sahva/types";
import { Button, Card, ErrorState, Field, Input, Spinner } from "@/components/ui";

type ClinicWithSettings = Tables<"clinics"> & { settings: Tables<"clinic_settings"> | null };

export default function AiPermissionsPage() {
  const clinic = useApi<ClinicWithSettings>("/clinic");

  if (clinic.loading) return <Spinner />;
  if (clinic.error) return <ErrorState error={clinic.error} onRetry={clinic.reload} />;
  if (!clinic.data) return null;

  return <AiPermissions clinic={clinic.data} onSaved={clinic.reload} />;
}

function AiPermissions({
  clinic,
  onSaved,
}: {
  clinic: ClinicWithSettings;
  onSaved: () => void;
}) {
  const s = clinic.settings;
  const [draft, setDraft] = React.useState({
    ai_enabled: s?.ai_enabled ?? true,
    ai_answers_after_hours: s?.ai_answers_after_hours ?? true,
    ai_may_book: s?.ai_may_book ?? true,
    ai_may_reschedule: s?.ai_may_reschedule ?? true,
    ai_may_cancel: s?.ai_may_cancel ?? false,
    min_notice_minutes: s?.min_notice_minutes ?? 30,
    booking_horizon_days: s?.booking_horizon_days ?? 30,
    reminder_hours_before: s?.reminder_hours_before ?? 18,
    escalation_phone_e164: s?.escalation_phone_e164 ?? "",
  });
  const [saved, setSaved] = React.useState(false);

  const save = useMutation(() =>
    patch("/clinic/settings", {
      ...draft,
      escalation_phone_e164: draft.escalation_phone_e164.trim() || null,
    }),
  );

  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setSaved(false);
  };

  return (
    <Card className="p-5">
      <div className="space-y-1">
        <Toggle
          label="AI answers calls"
          hint="Turn off to send every call straight to the front desk."
          checked={draft.ai_enabled}
          onChange={(v) => set("ai_enabled", v)}
        />
        <Toggle
          label="Answer after hours"
          hint="This is where most recovered calls come from."
          checked={draft.ai_answers_after_hours}
          onChange={(v) => set("ai_answers_after_hours", v)}
        />
        <Toggle
          label="May book appointments"
          checked={draft.ai_may_book}
          onChange={(v) => set("ai_may_book", v)}
        />
        <Toggle
          label="May reschedule"
          checked={draft.ai_may_reschedule}
          onChange={(v) => set("ai_may_reschedule", v)}
        />
        <Toggle
          label="May cancel appointments"
          hint="Off by default, deliberately. A wrongly cancelled medical appointment is the worst thing this system can do. With it off, the AI notes the request and a staff member confirms."
          checked={draft.ai_may_cancel}
          onChange={(v) => set("ai_may_cancel", v)}
          danger
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Minimum notice (minutes)" hint="How soon before a slot the AI may still book it.">
          <Input
            type="number"
            min={0}
            max={1440}
            value={draft.min_notice_minutes}
            onChange={(e) => set("min_notice_minutes", Number(e.target.value))}
          />
        </Field>
        <Field label="Booking horizon (days)" hint="How far ahead callers may book.">
          <Input
            type="number"
            min={1}
            max={180}
            value={draft.booking_horizon_days}
            onChange={(e) => set("booking_horizon_days", Number(e.target.value))}
          />
        </Field>
        <Field label="Reminder (hours before)" hint="When the reminder message goes out.">
          <Input
            type="number"
            min={1}
            max={72}
            value={draft.reminder_hours_before}
            onChange={(e) => set("reminder_hours_before", Number(e.target.value))}
          />
        </Field>
        <Field
          label="Escalation number"
          hint="Where the AI hands off on an emergency keyword."
        >
          <Input
            value={draft.escalation_phone_e164}
            onChange={(e) => set("escalation_phone_e164", e.target.value)}
            placeholder="+919849012345"
          />
        </Field>
      </div>

      {save.error && (
        <div className="mt-4">
          <ErrorState error={save.error} />
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-primary-700">Saved</span>}
        <Button
          disabled={save.pending}
          onClick={async () => {
            const ok = await save.run();
            if (ok) {
              setSaved(true);
              onSaved();
            }
          }}
        >
          {save.pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  danger,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-2.5 hover:bg-ink-100/50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-primary-600 focus:ring-primary-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">{label}</span>
        {hint && (
          <span
            className={`mt-0.5 block text-xs ${danger && checked ? "text-amber-700" : "text-ink-500"}`}
          >
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
