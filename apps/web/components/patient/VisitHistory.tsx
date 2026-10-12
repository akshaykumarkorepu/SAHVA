import { type Lang, patientDate } from "@/lib/portal/i18n";
import { Card, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { Visit } from "./types";

export function VisitHistory({ visits, L, lang }: { visits: Visit[]; L: boolean; lang: Lang }) {
  if (visits.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          icon="doctor"
          title={L ? "వైద్య చరిత్ర లేదు" : "No visit history yet"}
          body={
            L
              ? "డాక్టర్ నోట్‌ను ఖరారు చేసిన తర్వాత ఇక్కడ కనిపిస్తుంది."
              : "A visit appears here once the doctor finalises the note."
          }
        />
      </Card>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-line pl-6">
      {visits.map((v) => (
        <li key={v.id} className="relative">
          <span
            aria-hidden
            className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-surface"
            style={{ backgroundColor: v.doctor_colour }}
          />
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-[15px] font-semibold tracking-tight text-ink">
                {v.doctor_name}
                <span className="ml-2 text-xs font-normal text-ink-subtle">
                  {v.doctor_specialty}
                </span>
              </p>
              <p className="text-xs text-ink-subtle">
                {v.visited_at ? patientDate(v.visited_at, "Asia/Kolkata", lang) : ""}
              </p>
            </div>

            <dl className="mt-3 space-y-2.5 text-sm">
              {v.chief_complaint && (
                <Row label={L ? "ఫిర్యాదు" : "Complaint"}>{v.chief_complaint}</Row>
              )}
              {v.diagnosis_text && (
                <Row label={L ? "నిర్ధారణ" : "Diagnosis"}>
                  <strong className="font-semibold text-ink">{v.diagnosis_text}</strong>
                </Row>
              )}
              {v.advice && <Row label={L ? "సలహా" : "Advice"}>{v.advice}</Row>}
            </dl>

            {v.follow_up_days != null && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-surface-sunken px-2.5 py-1.5 text-xs text-ink-muted">
                <Icon name="clock" className="h-3.5 w-3.5" />
                {L
                  ? `${v.follow_up_days} రోజుల్లో మళ్ళీ చూపించండి`
                  : `Review in ${v.follow_up_days} days`}
              </p>
            )}
          </Card>
        </li>
      ))}
    </ol>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="text-ink-muted">{children}</dd>
    </div>
  );
}
