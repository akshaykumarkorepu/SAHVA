import { type Lang, patientDate } from "@/lib/portal/i18n";
import { Badge, Card, EmptyState, type Tone } from "@/components/ui";
import type { Vaccination, VaccinationStatus } from "./types";

export function VaccinationTracker({
  vaccinations,
  L,
  lang,
}: {
  vaccinations: Vaccination[];
  L: boolean;
  lang: Lang;
}) {
  if (vaccinations.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          icon="shield"
          title={L ? "టీకాలు లేవు" : "No vaccinations recorded"}
          body={L ? "ఇంకా ఏమీ నమోదు కాలేదు." : "Nothing recorded yet."}
        />
      </Card>
    );
  }

  // Keyed by the enum so a new vaccination status fails the build rather than
  // falling through to an unlabelled badge.
  const TONE: Record<VaccinationStatus, { tone: Tone; te: string; en: string }> = {
    administered: { tone: "good", te: "ఇచ్చారు", en: "Given" },
    due: { tone: "warn", te: "రావాలి", en: "Due" },
    overdue: { tone: "bad", te: "ఆలస్యం", en: "Overdue" },
    skipped: { tone: "neutral", te: "వదిలేశారు", en: "Skipped" },
  };

  return (
    <div className="space-y-2.5">
      {vaccinations.map((v) => {
        const meta = TONE[v.status];
        return (
          <Card key={v.id} className="flex items-center justify-between gap-3 p-4">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                {v.vaccine_catalogue?.name ?? v.vaccine_code}
                <span className="ml-2 text-xs font-normal text-ink-subtle">
                  {L ? "డోస్" : "Dose"} {v.dose_number}
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-ink-subtle">
                {v.administered_at
                  ? `${L ? "ఇచ్చిన తేదీ" : "Given"} ${patientDate(v.administered_at, "Asia/Kolkata", lang)}`
                  : v.due_date
                    ? `${L ? "గడువు" : "Due"} ${patientDate(`${v.due_date}T09:00:00`, "Asia/Kolkata", lang)}`
                    : ""}
              </span>
            </span>
            <Badge tone={meta.tone}>{L ? meta.te : meta.en}</Badge>
          </Card>
        );
      })}
    </div>
  );
}
