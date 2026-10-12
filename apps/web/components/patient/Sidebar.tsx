import { Badge, Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { ClinicInfo, Condition } from "./types";

/**
 * Patients in portal research consistently ask who can see their record.
 * Saying it plainly costs one card and is the honest answer here.
 */
export function PrivacyNote({ L }: { L: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-sunken/60 p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <Icon name="shield" className="h-4 w-4 text-brand-600" />
        {L ? "మీ రికార్డు ప్రైవేట్" : "Your record is private"}
      </p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
        {L
          ? "మీ క్లినిక్ సిబ్బంది మాత్రమే దీన్ని చూడగలరు. వేరే క్లినిక్ చూడలేదు."
          : "Only your clinic's staff can see this. No other clinic can."}
      </p>
    </div>
  );
}

export function ConditionsCard({ conditions, L }: { conditions: Condition[]; L: boolean }) {
  return (
    <div className="rounded-2xl border border-accent-amber/25 bg-accent-amber/[0.07] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-amber">
        {L ? "ప్రస్తుత పరిస్థితులు" : "Current conditions"}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {conditions.map((c) => (
          <Badge key={c.id} tone={c.status === "chronic" ? "warn" : "info"}>
            {c.condition}
          </Badge>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
        {L
          ? "ఏ డాక్టర్‌ని కలిసినా ఇది చూపించండి."
          : "Show this to any doctor you see."}
      </p>
    </div>
  );
}

export function ClinicCard({ clinic, L }: { clinic: ClinicInfo; L: boolean }) {
  const address = [clinic.address_line, clinic.landmark, clinic.city].filter(Boolean).join(", ");
  return (
    <Card className="p-5">
      <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
        {clinic.name}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{address}</p>
      <div className="mt-4 space-y-2">
        <a
          href={`tel:${clinic.phone_e164}`}
          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line-strong text-[13px] font-medium text-ink transition hover:bg-surface-sunken"
        >
          <Icon name="calls" className="h-4 w-4" />
          {L ? "క్లినిక్‌కి కాల్ చేయండి" : "Call the clinic"}
        </a>
        <a
          href={clinic.map_url ?? `https://maps.google.com/?q=${encodeURIComponent(address)}`}
          target="_blank"
          rel="noreferrer"
          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line-strong text-[13px] font-medium text-ink transition hover:bg-surface-sunken"
        >
          <Icon name="chevronRight" className="h-4 w-4" />
          {L ? "దారి చూపించు" : "Directions"}
        </a>
      </div>
    </Card>
  );
}
