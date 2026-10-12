"use client";

import Link from "next/link";
import { useRequirePatient } from "@/lib/portal/session";
import { useApi } from "@/lib/hooks";
import type { Medical } from "@/components/patient/types";
import { parseDose } from "@/lib/dose";
import { Button, ErrorState, Spinner } from "@/components/ui";

/**
 * A prescription, laid out for A4 — to print, or "Save as PDF" from the
 * browser's print dialog, for a pharmacy or another doctor.
 *
 * Patient-side on purpose: it is built from the record the patient already
 * holds. A staff print needs a clinical API with role checks and read
 * auditing, which do not exist yet.
 *
 * No QR code. A QR that opens the portal would print a credential onto
 * paper that is handed to pharmacists.
 */
export default function PrintPrescription({ params }: { params: { id: string } }) {
  const { status, me } = useRequirePatient();
  const medical = useApi<Medical>(status === "ready" ? "/me/medical" : null, [status]);

  if (status !== "ready" || medical.loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }
  if (medical.error) return <ErrorState error={medical.error} onRetry={medical.reload} />;

  const rx = medical.data?.prescriptions.find((p) => p.id === params.id);
  if (!me || !rx) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <p className="text-ink">That prescription is not on your record.</p>
        <Link href="/me" className="mt-4 inline-block text-brand-700 underline">
          Back to your record
        </Link>
      </main>
    );
  }

  const c = me.clinic;
  const p = me.patient;
  const age = p.approx_age_years ?? null;

  return (
    <main className="mx-auto max-w-[210mm] bg-white p-8 text-ink print:max-w-none print:p-0">
      <style>{`@page { size: A4; margin: 14mm; }`}</style>

      <div className="mb-6 flex justify-between gap-3 print:hidden">
        <Link href="/me">
          <Button variant="ghost" icon="chevronLeft">
            Back
          </Button>
        </Link>
        <Button icon="check" onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>

      <header className="flex items-start justify-between border-b-2 border-ink pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold">{c.name}</h1>
          <p className="text-sm">
            {[c.address_line, c.landmark, c.city, c.pincode].filter(Boolean).join(", ")}
          </p>
          <p className="text-sm">Phone {c.phone_e164}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">{rx.doctor_name}</p>
          {/* With the year: this is a document, and it outlives the visit. */}
          <p className="text-sm">
            {new Date(rx.issued_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: c.timezone,
            })}
          </p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <p>
          <span className="text-ink-subtle">Patient · రోగి</span>
          <br />
          <strong>{p.full_name}</strong>
        </p>
        <p>
          <span className="text-ink-subtle">Age / Sex</span>
          <br />
          {age != null ? `${age} y` : "—"} / {p.sex === "male" ? "M" : p.sex === "female" ? "F" : "—"}
        </p>
        <p>
          <span className="text-ink-subtle">Phone</span>
          <br />
          {p.phone_e164}
        </p>
      </section>

      <p className="mt-6 font-display text-3xl font-bold">℞</p>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink text-left">
            <th className="py-2 pr-2">Medicine · మందు</th>
            <th className="py-2 pr-2 text-center">Morning · ఉదయం</th>
            <th className="py-2 pr-2 text-center">Afternoon · మధ్యాహ్నం</th>
            <th className="py-2 pr-2 text-center">Night · రాత్రి</th>
            <th className="py-2">Days · రోజులు</th>
          </tr>
        </thead>
        <tbody>
          {rx.items.map((it, i) => {
            const dose = parseDose(it.frequency, it.instructions_en);
            // Only marked where the prescription states the timing for certain.
            const cell = (slot: "morning" | "afternoon" | "night") =>
              dose.slots ? (dose.slots.has(slot) ? "✓" : "—") : "";
            return (
              <tr key={`${it.drug_name}-${i}`} className="border-b border-line align-top">
                <td className="py-2 pr-2">
                  <strong>{it.drug_name}</strong> {it.strength}
                  <br />
                  <span className="text-xs">{[it.dosage, it.frequency].filter(Boolean).join(" · ")}</span>
                  {it.instructions_en && <span className="block text-xs">{it.instructions_en}</span>}
                  {it.instructions_te && (
                    <span lang="te" className="block text-xs">
                      {it.instructions_te}
                    </span>
                  )}
                </td>
                <td className="py-2 text-center">{cell("morning")}</td>
                <td className="py-2 text-center">{cell("afternoon")}</td>
                <td className="py-2 text-center">{cell("night")}</td>
                <td className="py-2">{it.duration_days ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rx.notes && <p className="mt-4 text-sm">{rx.notes}</p>}

      <footer className="mt-16 flex items-end justify-between text-xs text-ink-subtle">
        <p>
          Printed by the patient from their SAHVA record. The doctor&rsquo;s written instructions are the
          authority; where the timing columns are blank, follow them.
        </p>
        <p className="shrink-0 border-t border-ink pt-1 text-ink">{rx.doctor_name}</p>
      </footer>
    </main>
  );
}
