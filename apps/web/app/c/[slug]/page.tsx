"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { ClinicTab } from "@/components/patient/ClinicTab";
import { PageLoader } from "@/components/HeartLoader";
import { Icon } from "@/components/icons";

type Header = {
  clinic: { name: string; city: string; address_line: string | null; landmark: string | null; phone_e164: string; whatsapp_e164: string | null; map_url: string | null };
  booking: { enabled: boolean };
};

/**
 * A clinic's public page — the link it shares on Google Maps, WhatsApp or a
 * QR code at reception. Anyone can see the doctors and timings and request a
 * slot; the clinic confirms by calling back. Only live, approved clinics
 * have one.
 */
export default function PublicClinicPage({ params }: { params: { slug: string } }) {
  const [lang, setLang] = React.useState<"en" | "te">("en");
  const L = lang === "te";
  const q = useApi<Header>(`/public/clinics/${params.slug}`, [params.slug]);

  React.useEffect(() => {
    if (q.data) document.title = `${q.data.clinic.name}, ${q.data.clinic.city} — book online`;
  }, [q.data]);

  if (q.loading) return <PageLoader />;
  if (q.error || !q.data) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-surface px-4 text-center">
        <div className="max-w-sm">
          <p className="font-display text-xl font-semibold text-ink">{missing ? "This clinic page is not available" : "Something went wrong"}</p>
          <p className="mt-2 text-sm text-ink-muted">
            {missing ? "The link may be mistyped, or the clinic is not taking online bookings right now." : "Please try again in a moment."}
          </p>
          <Link href="/" className="mt-5 inline-block text-sm font-medium text-brand-700 underline">SAHVA home</Link>
        </div>
      </main>
    );
  }
  const c = q.data.clinic;
  const address = [c.address_line, c.landmark, c.city].filter(Boolean).join(", ");

  return (
    <main className="min-h-[100dvh] bg-surface pb-16">
      <header className="relative overflow-hidden border-b border-line bg-surface-raised">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(36rem_20rem_at_10%_0%,rgb(var(--brand-500)/0.12),transparent_60%)]"
        />
        <div className="relative mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[12px] font-bold uppercase tracking-wider text-brand-700">{L ? "ఆన్‌లైన్ అపాయింట్‌మెంట్" : "Book online"}</p>
              <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[34px]">{c.name}</h1>
              <p className="mt-1 text-sm text-ink-muted">{address}</p>
            </div>
            <button
              type="button"
              onClick={() => setLang(L ? "en" : "te")}
              className="shrink-0 rounded-xl border border-line bg-surface-raised px-3 py-1.5 text-sm text-ink hover:bg-surface-sunken"
            >
              {L ? "English" : "తెలుగు"}
            </button>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={`tel:${c.phone_e164}`} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-700">
              <Icon name="calls" className="h-4 w-4" /> {L ? "కాల్ చేయండి" : "Call"} {c.phone_e164.replace(/^\+91/, "")}
            </a>
            {c.whatsapp_e164 && (
              <a href={`https://wa.me/${c.whatsapp_e164.replace(/^\+/, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-4 py-2 text-sm font-medium text-ink hover:bg-surface-sunken">
                <Icon name="message" className="h-4 w-4" /> WhatsApp
              </a>
            )}
            <a
              href={c.map_url ?? `https://maps.google.com/?q=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-4 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
            >
              <Icon name="chevronRight" className="h-4 w-4" /> {L ? "దారి" : "Directions"}
            </a>
          </div>
          <p className="mt-4 text-xs text-ink-subtle">
            {q.data.booking.enabled
              ? L
                ? "కొత్త రోగులు: సమయం ఎంచుకోండి, క్లినిక్ మీకు కాల్ చేసి నిర్ధారిస్తుంది."
                : "New here? Pick a time below and the clinic will call you to confirm."
              : L
                ? "అపాయింట్‌మెంట్ కోసం క్లినిక్‌కు కాల్ చేయండి."
                : "To book, please call the clinic."}{" "}
            <Link href="/signin" className="font-medium text-brand-700 underline">
              {L ? "ఇప్పటికే రోగియా? సైన్ ఇన్" : "Already a patient? Sign in"}
            </Link>
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
        <ClinicTab L={L} source={{ kind: "public", slug: params.slug }} />
      </div>

      <footer className="mx-auto mt-10 flex max-w-4xl items-center gap-2 px-4 text-xs text-ink-subtle sm:px-6">
        <span className="relative h-5 w-5">
          <Image src="/brand/sahva-logo.png" alt="" fill className="object-contain" />
        </span>
        {L ? "SAHVA ద్వారా — క్లినిక్‌ల కోసం AI రిసెప్షనిస్ట్" : "Powered by SAHVA — the AI receptionist for clinics"}
      </footer>
    </main>
  );
}
