import { type Lang, patientDate } from "@/lib/portal/i18n";
import { Badge, Card, EmptyState, cn } from "@/components/ui";
import type { Prescription, RxItem } from "./types";
import { isActiveRx } from "./logic";
import { DosageVisualizer } from "./DosageVisualizer";

export function PrescriptionHistory({
  prescriptions,
  L,
  lang,
}: {
  prescriptions: Prescription[];
  L: boolean;
  lang: Lang;
}) {
  if (prescriptions.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          icon="activity"
          title={L ? "మందులు లేవు" : "No prescriptions"}
          body={L ? "ఇంకా ఏమీ ఇవ్వలేదు." : "Nothing has been prescribed yet."}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {prescriptions.map((rx) => {
        const active = isActiveRx(rx);
        return (
          <Card key={rx.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                {rx.doctor_name}
                <span className="ml-2 text-xs font-normal text-ink-subtle">
                  {patientDate(rx.issued_at, "Asia/Kolkata", lang)}
                </span>
              </p>
              <Badge tone={active ? "good" : "neutral"}>
                {active ? (L ? "ప్రస్తుతం" : "Active") : L ? "పాతది" : "Past"}
              </Badge>
            </div>

            <div className="mt-4 space-y-3">
              {rx.items.map((item, i) => (
                <MedicineCard key={`${item.drug_name}-${i}`} item={item} L={L} />
              ))}
            </div>

            {rx.notes && (
              <p className="mt-4 rounded-xl bg-surface-sunken p-3 text-[13px] leading-relaxed text-ink-muted">
                {rx.notes}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export function MedicineCard({
  item,
  L,
  compact,
}: {
  item: RxItem;
  L: boolean;
  compact?: boolean;
}) {
  const instruction = L ? (item.instructions_te ?? item.instructions_en) : item.instructions_en;
  return (
    <div
      className={cn(
        "rounded-xl border border-line p-3.5",
        compact ? "bg-surface-raised" : "bg-surface-sunken/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-sm font-semibold tracking-tight text-ink">
          {item.drug_name}
          {item.strength && (
            <span className="ml-1.5 font-sans text-xs font-medium text-ink-muted">
              {item.strength}
            </span>
          )}
        </p>
        {item.duration_days != null && (
          <span className="shrink-0 rounded-md bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            {item.duration_days} {L ? "రోజులు" : "days"}
          </span>
        )}
      </div>

      <p className="mt-1.5 text-xs text-ink-muted">
        {[item.dosage, item.frequency].filter(Boolean).join(" · ")}
      </p>

      <DosageVisualizer frequency={item.frequency} instructions={item.instructions_en} L={L} />

      {instruction && (
        <p className="mt-2 border-t border-line pt-2 text-[13px] leading-relaxed text-ink-muted">
          {instruction}
        </p>
      )}
    </div>
  );
}
