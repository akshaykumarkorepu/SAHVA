"use client";

import * as React from "react";
import { useRequirePatient } from "@/lib/portal/session";
import { useApi } from "@/lib/hooks";
import { STRINGS, patientDate, patientDateTime, type Lang } from "@/lib/portal/i18n";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingRows, Segmented, Spinner, cn } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type Visit = {
  id: string;
  chief_complaint: string | null;
  diagnosis_text: string | null;
  advice: string | null;
  follow_up_days: number | null;
  finalised_at: string | null;
  visited_at: string | null;
  doctor_name: string;
  doctor_specialty: string;
  doctor_colour: string;
};

type RxItem = {
  drug_name: string;
  strength: string | null;
  form: string | null;
  dosage: string | null;
  frequency: string | null;
  duration_days: number | null;
  instructions_en: string | null;
  instructions_te: string | null;
};

type Prescription = {
  id: string;
  issued_at: string;
  notes: string | null;
  doctor_name: string;
  items: RxItem[];
};

type Condition = {
  id: string;
  condition: string;
  status: "active" | "chronic" | "resolved";
  onset_date: string | null;
  resolved_date: string | null;
};

type Vaccination = {
  id: string;
  vaccine_code: string;
  dose_number: number;
  due_date: string | null;
  administered_at: string | null;
  status: "due" | "administered" | "overdue" | "skipped";
  vaccine_catalogue: { name: string; description: string | null } | null;
};

type Medical = {
  visits: Visit[];
  prescriptions: Prescription[];
  conditions: Condition[];
  vaccinations: Vaccination[];
};

type Tab = "appointments" | "history" | "medicines" | "vaccines";

/**
 * The signed-in patient's health record.
 *
 * Reachable only with a password, not with a portal link — a forwarded
 * WhatsApp message must not expose a diagnosis. Phone-first like the rest of
 * the patient surface.
 */
export default function PatientHomePage() {
  const { status, me, error, signOut } = useRequirePatient();
  const [lang, setLang] = React.useState<Lang>("te");
  const [tab, setTab] = React.useState<Tab>("appointments");

  const medical = useApi<Medical>(status === "ready" ? "/me/medical" : null, [status]);

  React.useEffect(() => {
    if (me?.patient.preferred_language) {
      setLang(me.patient.preferred_language === "te" ? "te" : "en");
    }
  }, [me?.patient.preferred_language]);

  const t = STRINGS[lang];
  const L = lang === "te";

  if (status === "loading" || status === "signed-out") {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-surface">
        <Spinner />
      </div>
    );
  }

  if (status === "not-a-patient") {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-surface px-4">
        <div className="max-w-sm rounded-3xl border border-line bg-surface-raised p-8 text-center">
          <Icon name="warning" className="mx-auto h-8 w-8 text-accent-amber" />
          <p className="mt-4 font-semibold text-ink">
            {L ? "ఈ ఖాతా ఏ రోగి రికార్డుతో అనుసంధానించబడలేదు" : "This account is not linked to a patient record"}
          </p>
          <p className="mt-2 text-sm text-ink-muted">{error}</p>
          <Button variant="secondary" className="mt-5" onClick={signOut}>
            {L ? "సైన్ అవుట్" : "Sign out"}
          </Button>
        </div>
      </div>
    );
  }

  if (!me) return null;

  const tabs: { value: Tab; label: string }[] = [
    { value: "appointments", label: L ? "అపాయింట్‌మెంట్లు" : "Appointments" },
    { value: "history", label: L ? "వైద్య చరిత్ర" : "History" },
    { value: "medicines", label: L ? "మందులు" : "Medicines" },
    { value: "vaccines", label: L ? "టీకాలు" : "Vaccines" },
  ];

  const activeConditions = (medical.data?.conditions ?? []).filter((c) => c.status !== "resolved");

  return (
    <main className="min-h-[100dvh] bg-surface pb-16">
      <header className="sticky top-0 z-30 border-b border-line glass">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 font-display text-sm font-extrabold text-white"
          >
            S
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold tracking-tight text-ink">
              {me.patient.full_name}
            </p>
            <p className="truncate text-[11px] text-ink-subtle">{me.clinic.name}</p>
          </div>
          <button
            onClick={() => setLang(L ? "en" : "te")}
            className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
          >
            {t.language}
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 pt-5">
        {/* Chronic conditions ride above the tabs: they are the thing a patient
            and any doctor they see next most need in front of them. */}
        {activeConditions.length > 0 && (
          <div className="mb-5 rounded-2xl border border-accent-amber/25 bg-accent-amber/[0.07] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-amber">
              {L ? "ప్రస్తుత పరిస్థితులు" : "Current conditions"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {activeConditions.map((c) => (
                <Badge key={c.id} tone={c.status === "chronic" ? "warn" : "info"}>
                  {c.condition}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4">
          <Segmented options={tabs} value={tab} onChange={setTab} />
        </div>

        {medical.loading && tab !== "appointments" ? (
          <LoadingRows rows={3} />
        ) : medical.error && tab !== "appointments" ? (
          <ErrorState error={medical.error} onRetry={medical.reload} />
        ) : (
          <>
            {tab === "appointments" && <Appointments me={me} lang={lang} t={t} L={L} />}
            {tab === "history" && <History visits={medical.data?.visits ?? []} lang={lang} tz={me.clinic.timezone} L={L} />}
            {tab === "medicines" && <Medicines list={medical.data?.prescriptions ?? []} lang={lang} tz={me.clinic.timezone} L={L} />}
            {tab === "vaccines" && <Vaccines list={medical.data?.vaccinations ?? []} lang={lang} tz={me.clinic.timezone} L={L} />}
          </>
        )}

        <div className="mt-10 rounded-2xl border border-line bg-surface-raised p-4">
          <p className="text-sm font-medium text-ink">{me.clinic.name}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">{me.clinic.landmark ?? me.clinic.city}</p>
          <div className="mt-3 flex gap-2 border-t border-line pt-3">
            <a href={`tel:${me.clinic.phone_e164}`} className="flex-1">
              <Button variant="secondary" size="sm" icon="calls" className="w-full">
                {t.callClinic}
              </Button>
            </a>
            <Button variant="ghost" size="sm" icon="signOut" onClick={signOut} className="flex-1">
              {L ? "సైన్ అవుట్" : "Sign out"}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

function Appointments({
  me,
  lang,
  t,
  L,
}: {
  me: NonNullable<ReturnType<typeof useRequirePatient>["me"]>;
  lang: Lang;
  t: (typeof STRINGS)["en"];
  L: boolean;
}) {
  return (
    <div className="space-y-4">
      {me.upcoming.length === 0 ? (
        <EmptyState icon="appointments" title={t.noUpcoming} body={t.noUpcomingBody} />
      ) : (
        me.upcoming.map((a) => (
          <Card key={a.id} className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">
              {t.upcoming}
            </p>
            <p className="mt-2 font-display text-xl font-bold tracking-tight text-ink">
              {patientDateTime(a.starts_at, a.timezone, lang)}
            </p>
            <p className="mt-1.5 text-sm text-ink-muted">
              {t.with} <span className="font-semibold text-ink">{a.doctor_name}</span> ·{" "}
              {a.doctor_specialty}
            </p>
            {a.reason && <p className="mt-1 text-sm text-ink-subtle">{a.reason}</p>}
          </Card>
        ))
      )}

      {me.past.length > 0 && (
        <section className="pt-2">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-subtle">
            {t.pastVisits}
          </h2>
          <Card className="divide-y divide-line overflow-hidden">
            {me.past.slice(0, 15).map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  aria-hidden
                  className="h-8 w-1 shrink-0 rounded-full opacity-50"
                  style={{ background: a.doctor_colour }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{a.doctor_name}</p>
                  <p className="truncate text-xs text-ink-subtle">
                    {patientDate(a.starts_at, a.timezone, lang)}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-ink-subtle">
                  {t.status[a.status as keyof typeof t.status] ?? a.status}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

function History({ visits, lang, tz, L }: { visits: Visit[]; lang: Lang; tz: string; L: boolean }) {
  if (visits.length === 0) {
    return (
      <EmptyState
        icon="doctor"
        title={L ? "ఇంకా వైద్య రికార్డులు లేవు" : "No visit notes yet"}
        body={
          L
            ? "డాక్టర్ మీ సందర్శన నోట్స్ పూర్తి చేసిన తర్వాత ఇక్కడ కనిపిస్తాయి."
            : "Notes appear here once the doctor finalises them after your visit."
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {visits.map((v, i) => (
        <Card key={v.id} className="animate-fade-up p-5" >
          <div style={{ animationDelay: `${i * 40}ms` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{v.doctor_name}</p>
                <p className="text-xs text-ink-subtle">{v.doctor_specialty}</p>
              </div>
              <p className="shrink-0 text-xs text-ink-subtle">
                {v.visited_at
                  ? patientDate(v.visited_at, tz, lang)
                  : v.finalised_at
                    ? patientDate(v.finalised_at, tz, lang)
                    : ""}
              </p>
            </div>

            <dl className="mt-4 space-y-3 text-sm">
              {v.chief_complaint && (
                <Row label={L ? "ఫిర్యాదు" : "Complaint"} value={v.chief_complaint} />
              )}
              {v.diagnosis_text && (
                <Row label={L ? "నిర్ధారణ" : "Diagnosis"} value={v.diagnosis_text} strong />
              )}
              {v.advice && <Row label={L ? "సలహా" : "Advice"} value={v.advice} />}
              {v.follow_up_days !== null && (
                <Row
                  label={L ? "తదుపరి సందర్శన" : "Follow-up"}
                  value={L ? `${v.follow_up_days} రోజుల్లో` : `in ${v.follow_up_days} days`}
                />
              )}
            </dl>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Medicines({
  list,
  lang,
  tz,
  L,
}: {
  list: Prescription[];
  lang: Lang;
  tz: string;
  L: boolean;
}) {
  if (list.length === 0) {
    return (
      <EmptyState
        icon="rupee"
        title={L ? "ఇంకా మందులు లేవు" : "No prescriptions yet"}
        body={L ? "డాక్టర్ రాసిన మందులు ఇక్కడ కనిపిస్తాయి." : "Medicines your doctor prescribes appear here."}
      />
    );
  }

  return (
    <div className="space-y-3">
      {list.map((rx) => (
        <Card key={rx.id} className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-sunken/50 px-4 py-3">
            <p className="text-sm font-semibold text-ink">{rx.doctor_name}</p>
            <p className="text-xs text-ink-subtle">{patientDate(rx.issued_at, tz, lang)}</p>
          </div>
          <ul className="divide-y divide-line">
            {rx.items.map((i, idx) => (
              <li key={idx} className="px-4 py-3">
                <p className="text-sm font-medium text-ink">
                  {i.drug_name}
                  {i.strength ? ` ${i.strength}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {[i.dosage, i.frequency, i.duration_days ? (L ? `${i.duration_days} రోజులు` : `${i.duration_days} days`) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {(L ? i.instructions_te : i.instructions_en) && (
                  <p className="mt-1 text-xs text-ink-subtle">
                    {L ? i.instructions_te : i.instructions_en}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {rx.notes && <p className="px-4 py-3 text-xs text-ink-subtle">{rx.notes}</p>}
        </Card>
      ))}
    </div>
  );
}

function Vaccines({
  list,
  lang,
  tz,
  L,
}: {
  list: Vaccination[];
  lang: Lang;
  tz: string;
  L: boolean;
}) {
  if (list.length === 0) {
    return (
      <EmptyState
        icon="shield"
        title={L ? "టీకా రికార్డు లేదు" : "No vaccination record"}
        body={
          L
            ? "పిల్లల టీకాలు ఇక్కడ ట్రాక్ చేయబడతాయి."
            : "Childhood vaccinations are tracked here."
        }
      />
    );
  }

  const tone = (s: Vaccination["status"]) =>
    s === "administered" ? "good" : s === "overdue" ? "bad" : s === "due" ? "warn" : "neutral";

  const label = (s: Vaccination["status"]) =>
    L
      ? { administered: "ఇచ్చారు", due: "రావాలి", overdue: "ఆలస్యం", skipped: "వదిలేశారు" }[s]
      : { administered: "Given", due: "Due", overdue: "Overdue", skipped: "Skipped" }[s];

  return (
    <Card className="divide-y divide-line overflow-hidden">
      {list.map((v) => (
        <div key={v.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {v.vaccine_catalogue?.name ?? v.vaccine_code}
              {v.dose_number > 1 && (
                <span className="text-ink-subtle"> · {L ? "డోస్" : "dose"} {v.dose_number}</span>
              )}
            </p>
            <p className="truncate text-xs text-ink-subtle">
              {v.administered_at
                ? patientDate(v.administered_at, tz, lang)
                : v.due_date
                  ? `${L ? "రావాల్సిన తేదీ" : "Due"} ${patientDate(`${v.due_date}T09:00:00+05:30`, tz, lang)}`
                  : ""}
            </p>
          </div>
          <Badge tone={tone(v.status)}>{label(v.status)}</Badge>
        </div>
      ))}
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className={cn("mt-0.5 leading-relaxed", strong ? "font-semibold text-ink" : "text-ink-muted")}>
        {value}
      </dd>
    </div>
  );
}
