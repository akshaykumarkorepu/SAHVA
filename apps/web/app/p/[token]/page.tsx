"use client";

import * as React from "react";
import { ApiError } from "@/lib/api";
import {
  portalFetch,
  type PortalAppointment,
  type PortalData,
  type PortalSlot,
} from "@/lib/portal/api";
import {
  STRINGS,
  patientDate,
  patientDateTime,
  patientTime,
  type Lang,
  type Strings,
} from "@/lib/portal/i18n";
import { Icon } from "@/components/icons";
import { Button, Field, Input, Modal, Spinner, Skeleton, cn } from "@/components/ui";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/**
 * Patient portal.
 *
 * Reached by tapping a link in a WhatsApp message — no signup, no password.
 * Designed phone-first and single-column, because that is the only way these
 * patients will ever open it. Large tap targets, one action per screen height,
 * and the clinic's phone number always one tap away: calling remains the
 * fallback for everything, by design.
 */
export default function PatientPortalPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const [data, setData] = React.useState<PortalData | null>(null);
  const [error, setError] = React.useState<ApiError | Error | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [lang, setLang] = React.useState<Lang>("en");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await portalFetch<PortalData>(token);
      setData(d);
      // Open in the language the clinic recorded for this patient.
      setLang(d.patient.preferred_language === "te" ? "te" : "en");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const t = STRINGS[lang];

  if (loading) return <PortalSkeleton />;
  if (error) return <ExpiredLink t={t} error={error} />;
  if (!data) return null;

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
              {data.clinic.name}
            </p>
            <p className="truncate text-[11px] text-ink-subtle">{data.clinic.city}</p>
          </div>

          <button
            onClick={() => setLang(lang === "te" ? "en" : "te")}
            className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
          >
            {t.language}
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 pt-6">
        <p className="text-sm text-ink-muted">
          {lang === "te" ? "నమస్తే" : "Hello"},{" "}
          <span className="font-semibold text-ink">{data.patient.full_name}</span>
        </p>

        <h1 className="mt-1 font-display text-display-md text-ink">{t.yourAppointment}</h1>

        <section className="mt-6 space-y-4">
          {data.upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface-raised/60 px-5 py-12 text-center">
              <Icon name="appointments" className="mx-auto h-8 w-8 text-ink-subtle" />
              <p className="mt-3 font-medium text-ink">{t.noUpcoming}</p>
              <p className="mt-1 text-sm text-ink-muted">{t.noUpcomingBody}</p>
              <a href={`tel:${data.clinic.phone_e164}`} className="mt-5 inline-block">
                <Button icon="calls">{t.callClinic}</Button>
              </a>
            </div>
          ) : (
            data.upcoming.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                clinic={data.clinic}
                permissions={data.permissions}
                token={token}
                lang={lang}
                t={t}
                onChanged={load}
              />
            ))
          )}
        </section>

        {data.past.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-subtle">
              {t.pastVisits}
            </h2>
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-raised">
              {data.past.slice(0, 10).map((a) => (
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
                  <span className="shrink-0 text-xs text-ink-subtle">{t.status[a.status]}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <UpgradeCard token={token} lang={lang} t={t} />

        <ClinicCard clinic={data.clinic} t={t} />
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

function AppointmentCard({
  appointment: a,
  clinic,
  permissions,
  token,
  lang,
  t,
  onChanged,
}: {
  appointment: PortalAppointment;
  clinic: PortalData["clinic"];
  permissions: PortalData["permissions"];
  token: string;
  lang: Lang;
  t: Strings;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState<null | "confirm" | "cancel">(null);
  const [rescheduleOpen, setRescheduleOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const confirmed = a.status === "confirmed" || a.confirmed_at !== null;
  const needsReschedule = a.status === "needs_reschedule";

  const act = async (kind: "confirm" | "cancel", body?: unknown) => {
    setBusy(kind);
    setErr(null);
    try {
      await portalFetch(token, `/appointments/${a.id}/${kind}`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
      setCancelOpen(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article
      className={cn(
        "overflow-hidden rounded-3xl border bg-surface-raised shadow-card animate-fade-up",
        needsReschedule ? "border-accent-amber/40" : "border-line",
      )}
    >
      <div className="relative p-5">
        <div className="pointer-events-none absolute inset-0 aurora opacity-70" aria-hidden />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">
                {t.upcoming}
              </p>
              <p className="mt-2 font-display text-[22px] font-bold leading-tight tracking-tight text-ink">
                {patientDateTime(a.starts_at, a.timezone, lang)}
              </p>
              <p className="mt-2 text-[15px] text-ink-muted">
                {t.with} <span className="font-semibold text-ink">{a.doctor_name}</span>
                <span className="text-ink-subtle"> · {a.doctor_specialty}</span>
              </p>
              {a.consult_fee_paise !== null && (
                <p className="mt-1 text-sm text-ink-subtle">
                  {t.fee}: ₹{(a.consult_fee_paise / 100).toFixed(0)}
                </p>
              )}
            </div>
            {confirmed && !needsReschedule && (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-500/12 text-brand-600 ring-1 ring-inset ring-brand-500/20">
                <Icon name="check" className="h-5 w-5" strokeWidth={2.4} />
              </span>
            )}
          </div>

          {needsReschedule && (
            <p className="mt-4 rounded-xl bg-accent-amber/10 px-3.5 py-3 text-sm leading-relaxed text-ink">
              {t.needsRescheduleNote}
            </p>
          )}
        </div>
      </div>

      {err && (
        <p role="alert" className="mx-5 mb-3 rounded-xl bg-accent-rose/10 px-3.5 py-3 text-sm text-ink">
          {err}
        </p>
      )}

      <div className="space-y-2 border-t border-line p-4">
        {!confirmed && !needsReschedule && (
          <Button
            size="lg"
            className="w-full"
            icon="check"
            loading={busy === "confirm"}
            onClick={() => act("confirm")}
          >
            {busy === "confirm" ? t.confirming : t.confirm}
          </Button>
        )}

        {confirmed && !needsReschedule && (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-brand-500/10 py-3 text-sm font-medium text-brand-700">
            <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
            {t.confirmed}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {permissions.may_reschedule && (
            <Button variant="secondary" size="lg" icon="clock" onClick={() => setRescheduleOpen(true)}>
              {t.reschedule}
            </Button>
          )}
          <a href={`tel:${clinic.phone_e164}`} className={permissions.may_reschedule ? "" : "col-span-2"}>
            <Button variant="secondary" size="lg" icon="calls" className="w-full">
              {t.callClinic}
            </Button>
          </a>
        </div>

        {permissions.may_cancel && !needsReschedule && (
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setCancelOpen(true)}>
            {t.cancel}
          </Button>
        )}
      </div>

      {rescheduleOpen && (
        <RescheduleSheet
          appointment={a}
          token={token}
          lang={lang}
          t={t}
          onClose={() => setRescheduleOpen(false)}
          onDone={() => {
            setRescheduleOpen(false);
            onChanged();
          }}
        />
      )}

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t.confirmCancelTitle}
        description={t.confirmCancelBody}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              {t.keep}
            </Button>
            <Button variant="danger" loading={busy === "cancel"} onClick={() => act("cancel")}>
              {busy === "cancel" ? t.cancelling : t.yesCancel}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          {patientDateTime(a.starts_at, a.timezone, lang)} · {a.doctor_name}
        </p>
      </Modal>
    </article>
  );
}

function RescheduleSheet({
  appointment: a,
  token,
  lang,
  t,
  onClose,
  onDone,
}: {
  appointment: PortalAppointment;
  token: string;
  lang: Lang;
  t: Strings;
  onClose: () => void;
  onDone: () => void;
}) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: a.timezone }).format(new Date());
  const [date, setDate] = React.useState(today);
  const [slots, setSlots] = React.useState<PortalSlot[] | null>(null);
  const [picked, setPicked] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setSlots(null);
    setPicked(null);
    portalFetch<PortalSlot[]>(token, `/appointments/${a.id}/slots?date=${date}`)
      .then((s) => !cancelled && setSlots(s))
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [token, a.id, date]);

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    setErr(null);
    try {
      await portalFetch(token, `/appointments/${a.id}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ new_starts_at: picked }),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t.pickNewTime}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t.keep}
          </Button>
          <Button disabled={!picked} loading={saving} onClick={save}>
            {saving ? t.saving : t.changeTo}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <input
          type="date"
          value={date}
          min={today}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 py-3 text-base text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
        />

        {err && (
          <p role="alert" className="rounded-xl bg-accent-rose/10 px-3.5 py-3 text-sm text-ink">
            {err}
          </p>
        )}

        {slots === null ? (
          <p className="py-6 text-center text-sm text-ink-subtle">{t.checking}</p>
        ) : slots.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-subtle">{t.noSlots}</p>
        ) : (
          // Big tap targets: this is a thumb on a phone, not a mouse.
          <div className="grid grid-cols-3 gap-2">
            {slots.map((s) => (
              <button
                key={s.slot_start}
                onClick={() => setPicked(s.slot_start)}
                className={cn(
                  "rounded-xl border py-3 text-sm font-medium transition duration-200 ease-spring active:scale-95",
                  picked === s.slot_start
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-line-strong text-ink hover:bg-surface-sunken",
                )}
              >
                {patientTime(s.slot_start, a.timezone, lang)}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ClinicCard({ clinic, t }: { clinic: PortalData["clinic"]; t: (typeof STRINGS)["en"] }) {
  const maps =
    clinic.map_url ??
    `https://maps.google.com/?q=${encodeURIComponent(
      [clinic.address_line, clinic.landmark, clinic.city, clinic.pincode].filter(Boolean).join(", "),
    )}`;

  return (
    <section className="mt-10 rounded-2xl border border-line bg-surface-raised p-5">
      <p className="font-display text-base font-semibold tracking-tight text-ink">{clinic.name}</p>
      {clinic.address_line && <p className="mt-1.5 text-sm text-ink-muted">{clinic.address_line}</p>}
      {/* Landmark first: it is how people here actually navigate. */}
      {clinic.landmark && <p className="text-sm font-medium text-ink">{clinic.landmark}</p>}
      <p className="text-sm text-ink-muted">
        {clinic.city}
        {clinic.pincode ? ` ${clinic.pincode}` : ""}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={`tel:${clinic.phone_e164}`}>
          <Button variant="secondary" icon="calls" className="w-full">
            {t.callClinic}
          </Button>
        </a>
        <a href={maps} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary" icon="arrowRight" className="w-full">
            {t.directions}
          </Button>
        </a>
      </div>
    </section>
  );
}

function PortalSkeleton() {
  return (
    <main className="min-h-[100dvh] bg-surface">
      <div className="mx-auto max-w-xl px-4 pt-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-9 w-64" />
        <Skeleton className="mt-6 h-64 w-full rounded-3xl" />
      </div>
    </main>
  );
}

function ExpiredLink({
  t,
  error,
}: {
  t: Strings;
  error: ApiError | Error;
}) {
  const api = error instanceof ApiError ? error : null;
  const expired = api?.status === 401;

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface-raised p-8 text-center shadow-card">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent-amber/12 text-accent-amber ring-1 ring-inset ring-accent-amber/20">
          <Icon name="warning" className="h-5 w-5" />
        </span>
        <h1 className="mt-4 font-display text-lg font-semibold tracking-tight text-ink">
          {expired ? t.linkExpired : error.message}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{expired ? t.linkExpiredBody : ""}</p>
      </div>
    </main>
  );
}


/**
 * The bridge between the two tiers.
 *
 * The link alone shows appointment logistics, which is safe to forward. The
 * medical record needs a password, and the link is what authorises setting
 * one — holding it already proves possession of the phone the clinic has on
 * file, so no SMS code is invented on top.
 */
function UpgradeCard({ token, lang, t }: { token: string; lang: Lang; t: Strings }) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErr(null);
    try {
      await portalFetch(token, "/account", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setDone(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <section className="mt-8 overflow-hidden rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] p-5">
        <div className="flex items-start gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white">
            <Icon name="shield" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-base font-semibold tracking-tight text-ink">
              {t.seeFullRecord}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t.seeFullRecordBody}</p>
          </div>
        </div>
        <Button size="lg" className="mt-4 w-full" onClick={() => setOpen(true)}>
          {t.createAccount}
        </Button>
        <p className="mt-3 text-center text-xs text-ink-subtle">
          {t.alreadyHaveAccount}{" "}
          <Link href="/patient/login" className="font-medium text-brand-600">
            {t.signIn}
          </Link>
        </p>
      </section>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={done ? t.accountCreated : t.createAccount}
        footer={
          done ? (
            <Link href="/patient/login">
              <Button>{t.signIn}</Button>
            </Link>
          ) : undefined
        }
      >
        {done ? (
          <p className="text-sm text-ink-muted">{t.accountCreatedBody}</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label={t.emailLabel} required>
              <Input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="text-base"
              />
            </Field>

            <Field label={t.passwordLabel} required hint={t.passwordHint}>
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-12 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-ink-subtle transition hover:bg-surface-sunken hover:text-ink"
                >
                  <Icon name={show ? "eyeOff" : "eye"} className="h-4 w-4" />
                </button>
              </div>
            </Field>

            {err && (
              <p role="alert" className="rounded-xl bg-accent-rose/10 px-3.5 py-3 text-sm text-ink">
                {err}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={pending}
              disabled={password.length < 10 || !email.includes("@")}
            >
              {pending ? t.creating : t.createAccount}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
