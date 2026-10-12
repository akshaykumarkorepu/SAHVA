import { type Lang, patientDate } from "@/lib/portal/i18n";
import { Badge, Card } from "@/components/ui";
import type { Appt, Invoice, Medical, Prescription, Tab } from "./types";
import { VisitHistory } from "./VisitHistory";
import { PrescriptionHistory, MedicineCard } from "./PrescriptionHistory";
import { VaccinationTracker } from "./VaccinationTracker";
import { InvoiceHistory } from "./InvoiceHistory";

export function TabPanel({
  tab,
  L,
  lang,
  me,
  medical,
  invoices,
  activeRx,
}: {
  tab: Tab;
  L: boolean;
  lang: Lang;
  me: { upcoming: Appt[]; past: Appt[] };
  medical: Medical | null;
  invoices: Invoice[];
  activeRx: Prescription[];
}) {
  switch (tab) {
    case "overview":
      return <OverviewTab L={L} lang={lang} me={me} activeRx={activeRx} />;
    case "visits":
      return <VisitHistory visits={medical?.visits ?? []} L={L} lang={lang} />;
    case "medicines":
      return <PrescriptionHistory prescriptions={medical?.prescriptions ?? []} L={L} lang={lang} />;
    case "vaccines":
      return <VaccinationTracker vaccinations={medical?.vaccinations ?? []} L={L} lang={lang} />;
    case "bills":
      return <InvoiceHistory invoices={invoices} L={L} lang={lang} />;
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
      {children}
    </h2>
  );
}

function OverviewTab({
  L,
  lang,
  me,
  activeRx,
}: {
  L: boolean;
  lang: Lang;
  me: { past: Appt[] };
  activeRx: Prescription[];
}) {
  const meds = activeRx.flatMap((r) => r.items);
  return (
    <div className="space-y-7">
      <section>
        <SectionTitle>{L ? "ఇప్పుడు తీసుకుంటున్న మందులు" : "Taking now"}</SectionTitle>
        {meds.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm text-ink-muted">
              {L ? "ప్రస్తుతం మందులు లేవు." : "No current medicines."}
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {meds.map((m, i) => (
              <MedicineCard key={`${m.drug_name}-${i}`} item={m} L={L} compact />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>{L ? "గత సందర్శనలు" : "Recent visits"}</SectionTitle>
        {me.past.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm text-ink-muted">{L ? "ఇంకా లేవు." : "Nothing yet."}</p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {me.past.slice(0, 3).map((a) => (
              <Card key={a.id} className="flex items-center justify-between gap-3 p-4">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{a.doctor_name}</span>
                  <span className="block text-xs text-ink-subtle">
                    {patientDate(a.starts_at, a.timezone, lang)}
                    {a.reason ? ` · ${a.reason}` : ""}
                  </span>
                </span>
                <Badge tone="good">{L ? "పూర్తయింది" : "Completed"}</Badge>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
