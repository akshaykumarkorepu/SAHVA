"use client";

import { useApi } from "@/lib/hooks";
import { setPatientClinic } from "@/lib/api";
import { cn } from "@/components/ui";

type LinkedClinic = { clinic_id: string; name: string; city: string; patient_name: string; current: boolean };

/**
 * For the rare patient registered at more than one SAHVA clinic: one record
 * per clinic, one tap to switch. Hidden for everyone else.
 */
export function ClinicSwitcher({ L }: { L: boolean }) {
  const q = useApi<LinkedClinic[]>("/me/clinics");
  const rows = q.data ?? [];
  if (rows.length < 2) return null;

  function choose(id: string) {
    setPatientClinic(id);
    // Every part of the page belongs to the chosen clinic: start it afresh.
    window.location.reload();
  }

  return (
    <nav aria-label={L ? "క్లినిక్ ఎంచుకోండి" : "Choose clinic"} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {rows.map((c) => (
        <button
          key={c.clinic_id}
          type="button"
          aria-current={c.current ? "true" : undefined}
          onClick={() => !c.current && choose(c.clinic_id)}
          className={cn(
            "shrink-0 rounded-2xl border px-3.5 py-2 text-left text-sm transition",
            c.current ? "border-brand-600 bg-brand-500/10 text-ink" : "border-line bg-surface-raised text-ink-muted hover:border-line-strong",
          )}
        >
          <span className="block font-medium text-ink">{c.name}</span>
          <span className="block text-xs text-ink-subtle">{c.city}</span>
        </button>
      ))}
    </nav>
  );
}
