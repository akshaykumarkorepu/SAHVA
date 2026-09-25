"use client";

import * as React from "react";
import { useApi, useMutation } from "@/lib/hooks";
import { patch } from "@/lib/api";
import { useCanAdminister } from "@/lib/session";
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
  PageHeader,
  Spinner,
} from "@/components/ui";
import { rupees } from "@/lib/format";

type ClinicWithSettings = Tables<"clinics"> & {
  settings: Tables<"clinic_settings"> | null;
};

export default function SettingsPage() {
  const canAdmin = useCanAdminister();
  const clinic = useApi<ClinicWithSettings>("/clinic");
  const doctors = useApi<Doctor[]>("/doctors");

  if (!canAdmin) {
    return (
      <EmptyState
        icon="⚙"
        title="Settings are owner and manager only"
        body="Ask your clinic owner if something here needs changing."
      />
    );
  }

  if (clinic.loading) return <Spinner />;
  if (clinic.error) return <ErrorState error={clinic.error} onRetry={clinic.reload} />;

  return (
    <>
      <PageHeader title="Settings" subtitle="What the AI receptionist is allowed to do." />

      <div className="space-y-6">
        <AiPermissions clinic={clinic.data!} onSaved={clinic.reload} />

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-ink-900">Doctors</h3>
          <p className="mb-4 text-xs text-ink-500">
            Fees and consultation length are read straight from here when the AI answers.
          </p>
          {doctors.loading ? (
            <Spinner />
          ) : (
            <div className="divide-y divide-ink-100">
              {(doctors.data ?? []).map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: d.colour_hex }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{d.spoken_name}</p>
                    <p className="truncate text-xs text-ink-500">
                      {d.specialty} · {d.consult_duration_min} min ·{" "}
                      {rupees(d.consult_fee_paise)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {d.languages.map((l) => (
                      <Badge key={l}>{l}</Badge>
                    ))}
                  </div>
                  {!d.is_active && <Badge tone="neutral">Inactive</Badge>}
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-ink-500">
            Editing doctors, weekly sessions and the knowledge base is not built yet — use the
            Supabase table editor for now.
          </p>
        </Card>
      </div>
    </>
  );
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
  });
  const save = useMutation(() => patch("/clinic/settings", draft));

  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-ink-900">AI permissions</h3>
      <p className="mb-4 text-xs text-ink-500">
        What the receptionist may do on a call, without asking anyone.
      </p>

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
      </div>

      {save.error && (
        <div className="mt-4">
          <ErrorState error={save.error} />
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button
          disabled={save.pending}
          onClick={async () => {
            const ok = await save.run();
            if (ok) onSaved();
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
