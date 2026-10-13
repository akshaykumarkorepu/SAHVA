"use client";

import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, get, post } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingRows, Modal, Textarea, cn } from "@/components/ui";
import { HeartLoader } from "@/components/HeartLoader";
import { Icon } from "@/components/icons";

type Session = { day_of_week: number; starts_at: string; ends_at: string };
type Doctor = {
  id: string;
  full_name: string;
  specialty: string;
  qualifications: string | null;
  languages: string[];
  consult_fee_paise: number | null;
  followup_fee_paise: number | null;
  consult_duration_min: number;
  colour_hex: string;
  sessions: Session[];
};
type ClinicData = {
  clinic: { id: string; name: string; city: string; phone_e164: string; timezone: string };
  booking: { enabled: boolean; horizon_days: number; min_notice_minutes: number };
  doctors: Doctor[];
  hours: { day_of_week: number; opens_at: string; closes_at: string; label: string | null }[];
  closures: { starts_on: string; ends_on: string; reason: string }[];
  services: { id: string; name_en: string; name_te: string | null; description: string | null; price_paise: number | null; duration_min: number | null }[];
  faqs: { id: string; question_en: string; question_te: string | null; answer_en: string; answer_te: string | null }[];
};
type Slot = { slot_start: string; slot_end: string; remaining: number };

/**
 * Where the clinic's data comes from and where a booking goes. A signed-in
 * patient books straight into the diary; a visitor on the public page sends
 * a request the clinic confirms by calling back.
 */
export type ClinicSource =
  | { kind: "patient" }
  | { kind: "public"; slug: string };

function paths(source: ClinicSource) {
  return source.kind === "patient"
    ? { profile: "/me/clinic", slots: (doc: string, date: string) => `/me/slots?doctor_id=${doc}&date=${date}`, book: "/me/appointments" }
    : {
        profile: `/public/clinics/${source.slug}`,
        slots: (doc: string, date: string) => `/public/clinics/${source.slug}/slots?doctor_id=${doc}&date=${date}`,
        book: `/public/clinics/${source.slug}/requests`,
      };
}

const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_TE = ["ఆది", "సోమ", "మంగళ", "బుధ", "గురు", "శుక్ర", "శని"];
const LANG_NAME: Record<string, [string, string]> = { te: ["Telugu", "తెలుగు"], en: ["English", "ఇంగ్లీష్"], hi: ["Hindi", "హిందీ"], ur: ["Urdu", "ఉర్దూ"] };

const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
/** "09:30" → "9:30 AM", "17:00" → "5 PM" — the way people read clinic boards. */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
}

/** "2026-11-25" → "25 Nov" (and a range when it spans days). */
function closureDates(from: string, to: string, L: boolean): string {
  const f = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(L ? "te-IN" : "en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  return from === to ? f(from) : `${f(from)} – ${f(to)}`;
}

/** Weekly sessions as a few readable lines: days that share hours are grouped. */
export function sessionLines(sessions: Session[], L: boolean): string[] {
  const byTime = new Map<string, number[]>();
  for (const s of sessions) {
    const key = `${clock(s.starts_at)} – ${clock(s.ends_at)}`;
    byTime.set(key, [...(byTime.get(key) ?? []), s.day_of_week]);
  }
  const names = L ? DAYS_TE : DAYS_EN;
  return [...byTime.entries()].map(([time, days]) => {
    // Monday first; runs of three or more consecutive days read as "Mon–Sat".
    const order = [...new Set(days)].map((d) => (d + 6) % 7).sort((a, b) => a - b);
    const parts: string[] = [];
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && order[j + 1] === order[j] + 1) j++;
      const name = (k: number) => names[(order[k] + 1) % 7];
      if (j - i >= 2) parts.push(`${name(i)}–${name(j)}`);
      else for (let k = i; k <= j; k++) parts.push(name(k));
      i = j + 1;
    }
    return `${parts.join(", ")} · ${time}`;
  });
}

/**
 * Your clinic, from the patient's side: who the doctors are, when they sit,
 * what they charge, and a way to book a free slot — plus the clinic's hours,
 * closures, services and common questions.
 */
export function ClinicTab({ L, source = { kind: "patient" } }: { L: boolean; source?: ClinicSource }) {
  const q = useApi<ClinicData>(paths(source).profile, [paths(source).profile]);
  const [booking, setBooking] = React.useState<Doctor | null>(null);

  if (q.loading) return <LoadingRows rows={4} />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error("Could not load")} onRetry={q.reload} />;
  const d = q.data;
  const names = L ? DAYS_TE : DAYS_EN;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">{L ? "డాక్టర్లు" : "Doctors"}</h2>
        {d.doctors.length === 0 ? (
          <EmptyState icon="doctor" title={L ? "డాక్టర్ల వివరాలు ఇంకా లేవు" : "No doctors listed yet"} body={L ? "అపాయింట్‌మెంట్ కోసం క్లినిక్‌కు కాల్ చేయండి." : "Call the clinic to book."} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {d.doctors.map((doc) => (
              <Card key={doc.id} className="flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-semibold text-white"
                    style={{ backgroundColor: doc.colour_hex }}
                  >
                    {doc.full_name.replace(/^Dr\.?\s*/i, "").slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{doc.full_name}</p>
                    <p className="text-sm text-brand-700">{doc.specialty}</p>
                    {doc.qualifications && <p className="text-xs text-ink-subtle">{doc.qualifications}</p>}
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-ink-muted">
                  {doc.sessions.length === 0 ? (
                    <li>{L ? "సమయాలు ఇంకా ఇవ్వలేదు" : "Timings not listed yet"}</li>
                  ) : (
                    sessionLines(doc.sessions, L).map((line) => (
                      <li key={line} className="flex gap-2">
                        <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
                        {line}
                      </li>
                    ))
                  )}
                  <li className="flex gap-2">
                    <Icon name="language" className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
                    {doc.languages.map((l) => (LANG_NAME[l] ?? [l, l])[L ? 1 : 0]).join(", ")}
                  </li>
                </ul>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <span className="text-sm text-ink">
                    {doc.consult_fee_paise != null ? (
                      <>
                        {L ? "ఫీజు" : "Fee"} <strong>{rupees(doc.consult_fee_paise)}</strong>
                      </>
                    ) : null}
                  </span>
                  {d.booking.enabled && doc.sessions.length > 0 ? (
                    <Button size="sm" onClick={() => setBooking(doc)} aria-label={L ? `${doc.full_name} తో బుక్ చేయండి` : `Book with ${doc.full_name}`}>
                      {L ? "బుక్ చేయండి" : "Book"}
                    </Button>
                  ) : (
                    <a href={`tel:${d.clinic.phone_e164}`} className="text-sm font-medium text-brand-700 underline">
                      {L ? "బుక్ చేయడానికి కాల్ చేయండి" : "Call to book"}
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-ink">{L ? "క్లినిక్ సమయాలు" : "Clinic hours"}</h2>
          {d.hours.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">{L ? "సమయాల కోసం కాల్ చేయండి." : "Call for timings."}</p>
          ) : (
            <dl className="mt-2 space-y-1 text-sm">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                const blocks = d.hours.filter((h) => h.day_of_week === day);
                return (
                  <div key={day} className="flex justify-between gap-3">
                    <dt className="text-ink-subtle">{names[day]}</dt>
                    <dd className="text-right text-ink">
                      {blocks.length === 0 ? (L ? "మూసి ఉంటుంది" : "Closed") : blocks.map((b) => `${clock(b.opens_at)} – ${clock(b.closes_at)}`).join(", ")}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
          {d.closures.length > 0 && (
            <div className="mt-3 rounded-xl bg-accent-amber/[0.08] p-3 text-sm text-ink" role="note">
              {d.closures.map((c) => (
                <p key={`${c.starts_on}-${c.ends_on}-${c.reason}`}>
                  <strong>{L ? "మూసి ఉంటుంది" : "Closed"}</strong> {closureDates(c.starts_on, c.ends_on, L)} · {c.reason}
                </p>
              ))}
            </div>
          )}
        </Card>

        {d.services.length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-ink">{L ? "సేవలు" : "Services"}</h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {d.services.map((s) => (
                <li key={s.id} className="flex justify-between gap-3 py-1.5">
                  <span className="text-ink">
                    {(L && s.name_te) || s.name_en}
                    {s.description && <span className="block text-xs text-ink-subtle">{s.description}</span>}
                  </span>
                  {s.price_paise != null && <span className="shrink-0 tabular-nums text-ink-muted">{rupees(s.price_paise)}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {d.faqs.length > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">{L ? "సాధారణ ప్రశ్నలు" : "Common questions"}</h2>
          <Card className="divide-y divide-line">
            {d.faqs.map((f) => (
              <details key={f.id} className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink">
                  {(L && f.question_te) || f.question_en}
                  <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-subtle transition group-open:rotate-90" />
                </summary>
                <p className="mt-2 text-sm text-ink-muted">{(L && f.answer_te) || f.answer_en}</p>
              </details>
            ))}
          </Card>
        </section>
      )}

      {booking && <BookingSheet doctor={booking} clinic={d} L={L} source={source} onClose={() => setBooking(null)} />}
    </div>
  );
}

/** YYYY-MM-DD for a day in the clinic's timezone. */
function localDay(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(at);
}

/**
 * Pick a day the doctor sits, then a free slot. Slots come from the same
 * availability the AI uses; booking re-checks inside the database, so a slot
 * taken a moment ago is reported, not double-booked.
 */
function BookingSheet({
  doctor,
  clinic,
  L,
  source,
  onClose,
}: {
  doctor: Doctor;
  clinic: ClinicData;
  L: boolean;
  source: ClinicSource;
  onClose: () => void;
}) {
  const visitor = source.kind === "public";
  const p = paths(source);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [website, setWebsite] = React.useState(""); // honeypot: hidden from people
  const [requested, setRequested] = React.useState<{ starts_at: string; phone: string } | null>(null);
  const tz = clinic.clinic.timezone || "Asia/Kolkata";
  const client = useQueryClient();
  const sitsOn = new Set(doctor.sessions.map((s) => s.day_of_week));
  const days = React.useMemo(() => {
    const out: { iso: string; date: Date }[] = [];
    for (let i = 0; i < Math.min(clinic.booking.horizon_days, 21) && out.length < 10; i++) {
      const date = new Date(Date.now() + i * 86_400_000);
      const iso = localDay(date, tz);
      const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
      if (sitsOn.has(dow)) out.push({ iso, date });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor.id]);
  const [day, setDay] = React.useState(days[0]?.iso ?? null);
  const [slots, setSlots] = React.useState<Slot[] | null>(null);
  const [slot, setSlot] = React.useState<Slot | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const slotsUrl = day ? p.slots(doctor.id, day) : null;
  React.useEffect(() => {
    if (!day || !slotsUrl) return;
    let stop = false;
    setSlots(null);
    setSlot(null);
    get<Slot[]>(slotsUrl)
      .then((s) => !stop && setSlots(s))
      .catch((e) => !stop && (setSlots([]), setError(e instanceof Error ? e.message : "Could not load times.")));
    return () => {
      stop = true;
    };
  }, [day, slotsUrl]);

  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const dayLabel = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(L ? "te-IN" : "en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  async function book() {
    if (!slot) return;
    if (visitor && (name.trim().length < 2 || phone.replace(/\D/g, "").length < 10)) {
      setError(L ? "మీ పేరు, 10 అంకెల మొబైల్ నంబర్ ఇవ్వండి." : "Enter your name and 10-digit mobile number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (visitor) {
        const r = await post<{ starts_at: string; phone: string }>(p.book, {
          doctor_id: doctor.id,
          starts_at: slot.slot_start,
          name: name.trim(),
          phone: phone.trim(),
          reason: reason.trim() || undefined,
          website,
        });
        setRequested(r);
        return;
      }
      await post(p.book, { doctor_id: doctor.id, starts_at: slot.slot_start, reason: reason.trim() || undefined });
      toast.success(L ? "అపాయింట్‌మెంట్ బుక్ అయింది" : `Booked with ${doctor.full_name} at ${time(slot.slot_start)}.`);
      void client.invalidateQueries({ queryKey: ["api"] });
      onClose();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      if (e instanceof ApiError && e.isSlotTaken) {
        setError(L ? "ఆ సమయం ఇప్పుడే బుక్ అయింది. వేరే సమయం ఎంచుకోండి." : "That time was just taken. Please pick another.");
        setSlots((s) => (s ?? []).filter((x) => x.slot_start !== slot.slot_start));
        setSlot(null);
      } else {
        setError(e instanceof Error ? e.message : "The booking did not go through.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (requested) {
    const when = `${dayLabel(localDay(new Date(requested.starts_at), tz))}, ${time(requested.starts_at)}`;
    return (
      <Modal open onClose={onClose} title={L ? "అభ్యర్థన పంపబడింది" : "Request sent"} footer={<Button onClick={onClose}>{L ? "సరే" : "Done"}</Button>}>
        <div className="space-y-3 pb-4 text-sm text-ink" role="status">
          <p>
            {L ? (
              <>
                <strong>{doctor.full_name}</strong> తో <strong>{when}</strong> సమయం మీకోసం ఉంచబడింది.
              </>
            ) : (
              <>
                We are holding <strong>{when}</strong> with <strong>{doctor.full_name}</strong> for you.
              </>
            )}
          </p>
          <p className="text-ink-muted">
            {L
              ? `${clinic.clinic.name} నుండి ${requested.phone} కు కాల్ వస్తుంది — నిర్ధారించిన తర్వాతే అపాయింట్‌మెంట్ ఖాయం. మిమ్మల్ని చేరుకోలేకపోతే, సమయం విడుదల అవుతుంది.`
              : `${clinic.clinic.name} will call ${requested.phone} to confirm. The appointment is final once they have spoken to you; if they cannot reach you, the time is released.`}
          </p>
          <a href={`tel:${clinic.clinic.phone_e164}`} className="inline-block font-medium text-brand-700 underline">
            {L ? "క్లినిక్‌కు కాల్ చేయండి" : "Call the clinic"} · {clinic.clinic.phone_e164}
          </a>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={L ? `${doctor.full_name} తో అపాయింట్‌మెంట్` : `Book with ${doctor.full_name}`}
      description={`${doctor.specialty}${doctor.consult_fee_paise != null ? ` · ${L ? "ఫీజు" : "Fee"} ${rupees(doctor.consult_fee_paise)}` : ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{L ? "రద్దు" : "Cancel"}</Button>
          <Button loading={busy} disabled={!slot} onClick={() => void book()}>
            {slot
              ? visitor
                ? L ? `${time(slot.slot_start)} కోసం అభ్యర్థించండి` : `Request ${time(slot.slot_start)}`
                : L ? `${time(slot.slot_start)} కి బుక్ చేయండి` : `Book ${time(slot.slot_start)}`
              : L ? "సమయం ఎంచుకోండి" : "Pick a time"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-4">
        {days.length === 0 ? (
          <p className="text-sm text-ink-muted">{L ? "రాబోయే రోజుల్లో ఖాళీ లేదు. క్లినిక్‌కు కాల్ చేయండి." : "No open days soon. Please call the clinic."}</p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-subtle">{L ? "రోజు" : "Day"}</p>
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={L ? "రోజు" : "Day"}>
                {days.map((x) => (
                  <button
                    key={x.iso}
                    type="button"
                    role="radio"
                    aria-checked={day === x.iso}
                    onClick={() => setDay(x.iso)}
                    className={cn(
                      "shrink-0 rounded-xl border px-3 py-2 text-sm transition",
                      day === x.iso ? "border-brand-600 bg-brand-600 text-on-brand" : "border-line bg-surface-raised text-ink hover:border-line-strong",
                    )}
                  >
                    {dayLabel(x.iso)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-subtle">{L ? "సమయం" : "Time"}</p>
              {slots === null ? (
                <div className="flex justify-center py-4"><HeartLoader size="sm" /></div>
              ) : slots.length === 0 ? (
                <p className="text-sm text-ink-muted">{L ? "ఈ రోజు ఖాళీ సమయాలు లేవు." : "No free times this day."}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={L ? "సమయం" : "Time"}>
                  {slots.map((s) => (
                    <button
                      key={s.slot_start}
                      type="button"
                      role="radio"
                      aria-checked={slot?.slot_start === s.slot_start}
                      onClick={() => setSlot(s)}
                      className={cn(
                        "rounded-xl border px-2 py-2 text-sm tabular-nums transition",
                        slot?.slot_start === s.slot_start ? "border-brand-600 bg-brand-600 text-on-brand" : "border-line bg-surface-raised text-ink hover:border-line-strong",
                      )}
                    >
                      {time(s.slot_start)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {visitor && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[13px] font-medium text-ink">{L ? "మీ పేరు" : "Your name"}</span>
                  <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} />
                </label>
                <label className="block">
                  <span className="text-[13px] font-medium text-ink">{L ? "మొబైల్ నంబర్" : "Mobile number"}</span>
                  <Input className="mt-1.5" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98765 43210" maxLength={20} />
                </label>
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="absolute -left-[9999px] h-0 w-0 opacity-0"
                  name="website"
                />
              </div>
            )}
            <label className="block">
              <span className="text-[13px] font-medium text-ink">{L ? "కారణం (ఐచ్ఛికం)" : "Reason (optional)"}</span>
              <Textarea rows={2} className="mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-accent-rose/[0.07] px-3 py-2 text-sm text-ink">
            {error}
          </p>
        )}
        <p className="text-xs text-ink-subtle">
          {visitor
            ? L
              ? "క్లినిక్ మీకు కాల్ చేసి నిర్ధారిస్తుంది. మీ నంబర్ ఈ క్లినిక్‌కు మాత్రమే."
              : "The clinic will call you to confirm. Your number goes to this clinic only."
            : L
              ? "బుక్ చేసిన తర్వాత క్లినిక్‌కు వెంటనే తెలుస్తుంది."
              : "The clinic sees your booking straight away."}{" "}
          <Badge tone="neutral">{L ? "ఆన్‌లైన్" : "Online"}</Badge>
        </p>
      </div>
    </Modal>
  );
}
