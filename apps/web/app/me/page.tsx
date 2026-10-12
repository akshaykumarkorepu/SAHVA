"use client";

import * as React from "react";
import { useRequirePatient } from "@/lib/portal/session";
import { useApi } from "@/lib/hooks";
import { STRINGS, patientDate, patientDateTime, type Lang } from "@/lib/portal/i18n";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingRows,
  Segmented,
  Spinner,
  cn,
  type Tone,
} from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

/* -------------------------------------------------------------------------- */
/* Types — the shapes the API returns                                          */
/* -------------------------------------------------------------------------- */

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

type ConditionStatus = "active" | "chronic" | "resolved";

type Condition = {
  id: string;
  condition: string;
  status: ConditionStatus;
  onset_date: string | null;
  resolved_date: string | null;
};

type VaccinationStatus = "due" | "administered" | "overdue" | "skipped";

type Vaccination = {
  id: string;
  vaccine_code: string;
  dose_number: number;
  due_date: string | null;
  administered_at: string | null;
  status: VaccinationStatus;
  vaccine_catalogue: { name: string; description: string | null } | null;
};

type Medical = {
  visits: Visit[];
  prescriptions: Prescription[];
  conditions: Condition[];
  vaccinations: Vaccination[];
};

/**
 * A scheduled follow-up, as GET /me/tasks returns it.
 *
 * The text comes from the care plan the task was generated from — care_tasks
 * itself carries none. Read-only on purpose: care_task_status tracks the
 * clinic's dispatch (`pending → sent`), not something a patient ticks off.
 */
type CareTask = {
  id: string;
  title: string;
  template_key: string | null;
  due_on: string;
  status: "pending" | "sent";
};

type InvoiceStatus = "draft" | "issued" | "paid" | "void";

type Invoice = {
  id: string;
  invoice_number: string;
  total_paise: number;
  status: InvoiceStatus;
  payment_mode: string | null;
  issued_at: string | null;
  paid_at: string | null;
  items: { description: string; quantity: number; unit_price_paise: number }[];
};

type Tab = "overview" | "visits" | "medicines" | "vaccines" | "bills";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/** Whole days from today to an ISO date, negative when it has passed. */
function daysFromToday(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const then = new Date(`${isoDate}T00:00:00`);
  return Math.round((then.getTime() - today.getTime()) / 86_400_000);
}

function isActiveRx(rx: Prescription): boolean {
  const longest = Math.max(0, ...rx.items.map((i) => i.duration_days ?? 0));
  if (longest === 0) return false;
  const ends = new Date(rx.issued_at).getTime() + longest * 86_400_000;
  return ends >= Date.now();
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The signed-in patient's record.
 *
 * Reachable only with a password, never with a portal link — a forwarded
 * WhatsApp message must not expose a diagnosis. Phone-first, but it now also
 * uses the width when there is width: a single narrow column on a laptop made
 * a real record look like an empty app.
 */
export default function PatientHomePage() {
  const { status, me, error, signOut } = useRequirePatient();
  const [lang, setLang] = React.useState<Lang>("te");
  const [tab, setTab] = React.useState<Tab>("overview");

  const ready = status === "ready";
  const medical = useApi<Medical>(ready ? "/me/medical" : null, [status]);
  const tasks = useApi<CareTask[]>(ready ? "/me/tasks" : null, [status]);
  const invoices = useApi<Invoice[]>(ready ? "/me/invoices" : null, [status]);

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
      <Centred>
        <Icon name="warning" className="mx-auto h-8 w-8 text-accent-amber" />
        <p className="mt-4 font-semibold text-ink">
          {L
            ? "ఈ ఖాతా ఏ రోగి రికార్డుతో అనుసంధానించబడలేదు"
            : "This account is not linked to a patient record"}
        </p>
        <p className="mt-2 text-sm text-ink-muted">{error}</p>
        <Button variant="secondary" className="mt-5" onClick={signOut}>
          {L ? "సైన్ అవుట్" : "Sign out"}
        </Button>
      </Centred>
    );
  }

  // Without this branch the page falls through every guard and renders an empty
  // body — the staff shell handles "unconfigured", the patient surface did not.
  if (status === "unconfigured") {
    return (
      <Centred tone="amber">
        <Icon name="warning" className="mx-auto h-8 w-8 text-accent-amber" />
        <p className="mt-4 font-semibold text-ink">Supabase is not configured</p>
        <p className="mt-2 text-sm text-ink-muted">
          Set the <code className="font-mono text-[12px] text-ink">NEXT_PUBLIC_SUPABASE_*</code>{" "}
          variables and restart. See{" "}
          <code className="font-mono text-[12px] text-ink">docs/setup.md</code>.
        </p>
      </Centred>
    );
  }

  if (!me) return null;

  const next = me.upcoming[0] ?? null;
  const conditions = (medical.data?.conditions ?? []).filter((c) => c.status !== "resolved");
  const activeRx = (medical.data?.prescriptions ?? []).filter(isActiveRx);
  const vaccinesDue = (medical.data?.vaccinations ?? []).filter(
    (v) => v.status === "due" || v.status === "overdue",
  );
  const openTasks = tasks.data ?? [];
  const unpaid = (invoices.data ?? []).filter((i) => i.status === "issued");
  const owed = unpaid.reduce((s, i) => s + i.total_paise, 0);

  const tabs: { value: Tab; label: string }[] = [
    { value: "overview", label: L ? "సారాంశం" : "Overview" },
    { value: "visits", label: L ? "వైద్య చరిత్ర" : "Visits" },
    { value: "medicines", label: L ? "మందులు" : "Medicines" },
    { value: "vaccines", label: L ? "టీకాలు" : "Vaccines" },
    { value: "bills", label: L ? "బిల్లులు" : "Bills" },
  ];

  const loading = medical.loading || tasks.loading || invoices.loading;

  // Tiles earn their place. A row of zeroes is noise, and on a record with
  // nothing in it yet that row was most of the screen.
  type Tile = { icon: IconName; value: string; label: string; tone?: "warn" };
  const tiles: Tile[] = [];

  if (activeRx.length > 0) {
    tiles.push({
      icon: "activity",
      value: String(activeRx.reduce((n, r) => n + r.items.length, 0)),
      label: L ? "ప్రస్తుత మందులు" : "Medicines you take",
    });
  }
  if (vaccinesDue.length > 0) {
    tiles.push({
      icon: "shield",
      value: String(vaccinesDue.length),
      label: L ? "రాబోయే టీకాలు" : "Vaccines due",
      tone: vaccinesDue.some((v) => v.status === "overdue") ? "warn" : undefined,
    });
  }
  if (owed > 0) {
    tiles.push({
      icon: "rupee",
      value: rupees(owed),
      label: L ? "చెల్లించాల్సినది" : "Amount to pay",
      tone: "warn",
    });
  }
  if (conditions.length > 0) {
    tiles.push({
      icon: "heart",
      value: String(conditions.length),
      label: L ? "ప్రస్తుత పరిస్థితులు" : "Ongoing conditions",
    });
  }

  return (
    <main className="min-h-[100dvh] bg-surface pb-20">
      <PatientHeader
        name={me.patient.full_name}
        clinic={me.clinic.name}
        languageLabel={t.language}
        onToggleLang={() => setLang(L ? "en" : "te")}
        onSignOut={signOut}
        signOutLabel={L ? "సైన్ అవుట్" : "Sign out"}
      />

      <div className="mx-auto max-w-5xl px-4 pt-5 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_292px] lg:items-start">
          <div className="min-w-0 space-y-5">
            {next ? (
              <AppointmentHero appt={next} L={L} lang={lang} clinic={me.clinic} />
            ) : (
              <NoAppointment L={L} lang={lang} clinic={me.clinic} lastVisit={me.past[0] ?? null} />
            )}

            <QuickActions L={L} clinic={me.clinic} onJump={setTab} />

            {tiles.length > 0 && <StatRow L={L} stats={tiles} />}

            {openTasks.length > 0 && <CareTasks tasks={openTasks} L={L} lang={lang} />}

            <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <Segmented options={tabs} value={tab} onChange={setTab} />
            </div>

            {loading ? (
              <LoadingRows rows={3} />
            ) : medical.error ? (
              <ErrorState error={medical.error} onRetry={medical.reload} />
            ) : (
              <TabPanel
                tab={tab}
                L={L}
                lang={lang}
                me={me}
                medical={medical.data}
                invoices={invoices.data ?? []}
                activeRx={activeRx}
              />
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            {conditions.length > 0 && <ConditionsCard conditions={conditions} L={L} />}
            <ClinicCard clinic={me.clinic} L={L} />
            <PrivacyNote L={L} />
          </aside>
        </div>
      </div>
    </main>
  );
}

function Centred({ children, tone }: { children: React.ReactNode; tone?: "amber" }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-surface px-4">
      <div
        className={cn(
          "w-full max-w-sm rounded-3xl border p-8 text-center",
          tone === "amber"
            ? "border-accent-amber/25 bg-accent-amber/[0.07]"
            : "border-line bg-surface-raised",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function PatientHeader({
  name,
  clinic,
  languageLabel,
  onToggleLang,
  onSignOut,
  signOutLabel,
}: {
  name: string;
  clinic: string;
  languageLabel: string;
  onToggleLang: () => void;
  onSignOut: () => void;
  signOutLabel: string;
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-line glass">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 font-display text-sm font-extrabold text-white"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-semibold tracking-tight text-ink">
            {name}
          </p>
          <p className="truncate text-[11px] text-ink-subtle">{clinic}</p>
        </div>
        <button
          onClick={onToggleLang}
          className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
        >
          {languageLabel}
        </button>
        <button
          onClick={onSignOut}
          title={signOutLabel}
          aria-label={signOutLabel}
          className="grid h-9 w-9 place-items-center rounded-lg text-ink-subtle transition hover:bg-surface-sunken hover:text-ink"
        >
          <Icon name="signOut" className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero + stats                                                                */
/* -------------------------------------------------------------------------- */

type ClinicInfo = {
  name: string;
  phone_e164: string;
  address_line: string | null;
  landmark: string | null;
  city: string;
  map_url: string | null;
  timezone: string;
};

type Appt = {
  id: string;
  starts_at: string;
  status: string;
  reason: string | null;
  doctor_name: string;
  doctor_specialty: string;
  consult_fee_paise: number | null;
  timezone: string;
};

/**
 * No upcoming visit.
 *
 * This used to be a 250px dashed box containing an icon and an apology, which
 * on a record with nothing else in it was most of the screen. A patient in
 * that state wants one thing — to get an appointment — so the card is now the
 * height of its content and leads with the way to get one.
 */
function NoAppointment({
  L,
  lang,
  clinic,
  lastVisit,
}: {
  L: boolean;
  lang: Lang;
  clinic: ClinicInfo;
  lastVisit: Appt | null;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          {L ? "రాబోయే అపాయింట్‌మెంట్" : "Next appointment"}
        </p>
        <p className="mt-1.5 font-display text-xl font-semibold tracking-tight text-ink">
          {L ? "ఏదీ షెడ్యూల్ కాలేదు" : "Nothing scheduled"}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {lastVisit
            ? L
              ? `చివరి సందర్శన ${patientDate(lastVisit.starts_at, lastVisit.timezone, lang)}`
              : `Last visit ${patientDate(lastVisit.starts_at, lastVisit.timezone, lang)}`
            : L
              ? "క్లినిక్‌కి కాల్ చేస్తే మాయ 24/7 బుక్ చేస్తుంది."
              : "Call the clinic — Maya books appointments 24/7."}
        </p>
      </div>
      <a
        href={`tel:${clinic.phone_e164}`}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-on-brand shadow-glow transition hover:bg-brand-700 active:scale-[.98]"
      >
        <Icon name="calls" className="h-4 w-4" />
        {L ? "బుక్ చేయడానికి కాల్ చేయండి" : "Call to book"}
      </a>
    </Card>
  );
}

/** The appointment itself — the one thing a patient opens this page for. */
function AppointmentHero({
  appt,
  L,
  lang,
  clinic,
}: {
  appt: Appt;
  L: boolean;
  lang: Lang;
  clinic: ClinicInfo;
}) {
  const days = Math.round(
    (new Date(appt.starts_at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000,
  );
  const when =
    days === 0
      ? L
        ? "ఈ రోజు"
        : "Today"
      : days === 1
        ? L
          ? "రేపు"
          : "Tomorrow"
        : L
          ? `${days} రోజుల్లో`
          : `In ${days} days`;

  const address = [clinic.address_line, clinic.landmark, clinic.city].filter(Boolean).join(", ");

  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 p-5 text-on-brand sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-75">
              {L ? "రాబోయే అపాయింట్‌మెంట్" : "Next appointment"}
            </p>
            <p className="mt-1.5 font-display text-[25px] font-bold leading-tight tracking-tight sm:text-[29px]">
              {patientDateTime(appt.starts_at, appt.timezone, L ? "te" : "en")}
            </p>
            <p className="mt-1.5 text-[15px] opacity-90">
              {L ? "వద్ద " : "with "}
              <strong className="font-semibold">{appt.doctor_name}</strong> · {appt.doctor_specialty}
            </p>
            {appt.reason && <p className="mt-0.5 text-sm opacity-75">{appt.reason}</p>}
          </div>
          <span className="shrink-0 rounded-full bg-on-brand/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ring-current/25">
            {when}
          </span>
        </div>

        {appt.status === "confirmed" && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-on-brand/15 px-3 py-2 text-[13px] font-medium ring-1 ring-inset ring-current/20">
            <Icon name="check" className="h-4 w-4" />
            {L ? "నిర్ధారించబడింది — అప్పుడు కలుద్దాం" : "Confirmed — see you then"}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 divide-x divide-line border-t border-line sm:grid-cols-3">
        <ApptAction href={`tel:${clinic.phone_e164}`} icon="calls" label={L ? "కాల్ చేయండి" : "Call clinic"} />
        <ApptAction
          href={clinic.map_url ?? `https://maps.google.com/?q=${encodeURIComponent(address)}`}
          icon="chevronRight"
          label={L ? "దారి చూపించు" : "Directions"}
          external
        />
        {appt.consult_fee_paise != null && (
          <div className="col-span-2 flex items-center justify-center gap-2 px-4 py-3 text-[13px] text-ink-muted sm:col-span-1">
            <Icon name="rupee" className="h-4 w-4 text-ink-subtle" />
            {L ? "ఫీజు" : "Fee"}
            <strong className="font-semibold text-ink">{rupees(appt.consult_fee_paise)}</strong>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * The four things a patient does here, as targets rather than prose.
 * Patient-portal research is consistent on this: large, obvious buttons for
 * the handful of common tasks beat a navigable information architecture.
 */
function QuickActions({
  L,
  clinic,
  onJump,
}: {
  L: boolean;
  clinic: ClinicInfo;
  onJump: (t: Tab) => void;
}) {
  const address = [clinic.address_line, clinic.landmark, clinic.city].filter(Boolean).join(", ");
  const base =
    "flex flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface-raised px-2 py-4 text-center text-[12px] font-medium text-ink transition hover:border-line-strong hover:bg-surface-sunken active:scale-[.98]";

  return (
    <div className="grid grid-cols-4 gap-2.5">
      <a href={`tel:${clinic.phone_e164}`} className={base}>
        <Icon name="calls" className="h-[18px] w-[18px] text-brand-600" />
        {L ? "కాల్" : "Call"}
      </a>
      <a
        href={clinic.map_url ?? `https://maps.google.com/?q=${encodeURIComponent(address)}`}
        target="_blank"
        rel="noreferrer"
        className={base}
      >
        <Icon name="chevronRight" className="h-[18px] w-[18px] text-brand-600" />
        {L ? "దారి" : "Directions"}
      </a>
      <button type="button" onClick={() => onJump("medicines")} className={base}>
        <Icon name="activity" className="h-[18px] w-[18px] text-brand-600" />
        {L ? "మందులు" : "Medicines"}
      </button>
      <button type="button" onClick={() => onJump("visits")} className={base}>
        <Icon name="doctor" className="h-[18px] w-[18px] text-brand-600" />
        {L ? "రికార్డు" : "Records"}
      </button>
    </div>
  );
}

/**
 * Patients in portal research consistently ask who can see their record.
 * Saying it plainly costs one card and is the honest answer here.
 */
function PrivacyNote({ L }: { L: boolean }) {
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

function ApptAction({
  href,
  icon,
  label,
  external,
}: {
  href: string;
  icon: IconName;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="flex items-center justify-center gap-2 px-4 py-3.5 text-[13px] font-medium text-ink transition hover:bg-surface-sunken"
    >
      <Icon name={icon} className="h-4 w-4 text-ink-subtle" />
      {label}
    </a>
  );
}

function StatRow({
  stats,
  L,
}: {
  L: boolean;
  stats: { icon: IconName; label: string; value: string; tone?: "warn" }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className={cn(
            "rounded-2xl border bg-surface-raised p-4",
            s.tone === "warn" ? "border-accent-amber/35 bg-accent-amber/[0.05]" : "border-line",
          )}
        >
          <Icon
            name={s.icon}
            className={cn("h-4 w-4", s.tone === "warn" ? "text-accent-amber" : "text-ink-subtle")}
          />
          <p className="mt-2.5 font-display text-lg font-bold tracking-tight text-ink">{s.value}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Care tasks                                                                  */
/* -------------------------------------------------------------------------- */

function CareTasks({
  tasks,
  L,
  lang,
}: {
  tasks: CareTask[];
  L: boolean;
  lang: Lang;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Icon name="inbox" className="h-4 w-4 text-brand-700" />
        <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
          {L ? "రాబోయే ఫాలో-అప్‌లు" : "Upcoming follow-ups"}
        </h2>
      </div>

      <ul className="mt-4 space-y-2.5">
        {tasks.map((task) => {
          const days = daysFromToday(task.due_on);
          const overdue = days < 0;
          return (
            <li
              key={task.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                overdue ? "border-accent-rose/30 bg-accent-rose/[0.05]" : "border-line",
              )}
            >
              <Icon
                name={overdue ? "warning" : "clock"}
                className={cn("h-4 w-4 shrink-0", overdue ? "text-accent-rose" : "text-ink-subtle")}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{task.title}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-xs",
                    overdue ? "font-medium text-accent-rose" : "text-ink-subtle",
                  )}
                >
                  {overdue
                    ? L
                      ? `${Math.abs(days)} రోజులు ఆలస్యం`
                      : `${Math.abs(days)} days overdue`
                    : `${L ? "గడువు" : "Due"} ${patientDate(`${task.due_on}T09:00:00`, "Asia/Kolkata", lang)}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-subtle">
        {L
          ? "వీటి కోసం క్లినిక్ మీకు గుర్తు చేస్తుంది. ముందుగా రావాలంటే కాల్ చేయండి."
          : "The clinic will remind you about these. Call if you would like to come in sooner."}
      </p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Sidebar                                                                     */
/* -------------------------------------------------------------------------- */

function ConditionsCard({ conditions, L }: { conditions: Condition[]; L: boolean }) {
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

function ClinicCard({ clinic, L }: { clinic: ClinicInfo; L: boolean }) {
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

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

function TabPanel({
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
      return <VisitsTab visits={medical?.visits ?? []} L={L} lang={lang} />;
    case "medicines":
      return <MedicinesTab prescriptions={medical?.prescriptions ?? []} L={L} lang={lang} />;
    case "vaccines":
      return <VaccinesTab vaccinations={medical?.vaccinations ?? []} L={L} lang={lang} />;
    case "bills":
      return <BillsTab invoices={invoices} L={L} lang={lang} />;
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

function VisitsTab({ visits, L, lang }: { visits: Visit[]; L: boolean; lang: Lang }) {
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

function MedicinesTab({
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

function MedicineCard({
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

      {instruction && (
        <p className="mt-2 border-t border-line pt-2 text-[13px] leading-relaxed text-ink-muted">
          {instruction}
        </p>
      )}
    </div>
  );
}

function VaccinesTab({
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

function BillsTab({ invoices, L, lang }: { invoices: Invoice[]; L: boolean; lang: Lang }) {
  if (invoices.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          icon="rupee"
          title={L ? "బిల్లులు లేవు" : "No bills"}
          body={L ? "ఇంకా ఏమీ జారీ కాలేదు." : "Nothing has been issued yet."}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((inv) => {
        const paid = inv.status === "paid";
        return (
          <Card key={inv.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-sm font-semibold tracking-tight text-ink">
                  {inv.invoice_number}
                </p>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {inv.issued_at ? patientDate(inv.issued_at, "Asia/Kolkata", lang) : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg font-bold tracking-tight text-ink">
                  {rupees(inv.total_paise)}
                </p>
                <Badge tone={paid ? "good" : "warn"}>
                  {paid
                    ? L
                      ? "చెల్లించారు"
                      : "Paid"
                    : L
                      ? "చెల్లించాలి"
                      : "Due"}
                </Badge>
              </div>
            </div>

            <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
              {inv.items.map((it, i) => (
                <li key={`${it.description}-${i}`} className="flex justify-between gap-3 text-[13px]">
                  <span className="text-ink-muted">
                    {it.description}
                    {it.quantity > 1 && ` × ${it.quantity}`}
                  </span>
                  <span className="shrink-0 text-ink">
                    {rupees(it.unit_price_paise * it.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            {!paid && (
              <p className="mt-4 rounded-xl bg-accent-amber/[0.08] p-3 text-[13px] text-ink-muted">
                {L
                  ? "క్లినిక్‌లో చెల్లించండి. ఆన్‌లైన్ చెల్లింపు ఇంకా అందుబాటులో లేదు."
                  : "Pay at the clinic. Online payment is not available yet."}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
