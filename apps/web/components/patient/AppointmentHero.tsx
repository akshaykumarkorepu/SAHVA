import { type Lang, patientDate, patientDateTime } from "@/lib/portal/i18n";
import { Card } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import type { Appt, ClinicInfo, Tab } from "./types";
import { rupees } from "./logic";

/**
 * No upcoming visit.
 *
 * This used to be a 250px dashed box containing an icon and an apology, which
 * on a record with nothing else in it was most of the screen. A patient in
 * that state wants one thing — to get an appointment — so the card is now the
 * height of its content and leads with the way to get one.
 */
export function NoAppointment({
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
export function AppointmentHero({
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
export function QuickActions({
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
