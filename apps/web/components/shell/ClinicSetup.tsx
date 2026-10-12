"use client";

import * as React from "react";
import { ApiError, post } from "@/lib/api";
import { toIndianE164 } from "@/lib/phone";
import { COUNCILS, PINCODE, STATES, idProblems, type ApplicationIds } from "@/lib/verification";
import { Button, Field, Input, Select, cn } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * A new owner applies for their clinic. SAHVA checks the facility and doctor
 * registrations before anything reaches patients; the owner can set up the
 * clinic while that happens, and the 14-day trial starts at approval.
 *
 * Shown to any signed-in staff account without a clinic. Someone waiting on
 * an invite sees it too, so it says how to join an existing clinic instead.
 */
export function ClinicSetup({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("");
  const [pincode, setPincode] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [ids, setIds] = React.useState<ApplicationIds>({
    idType: "hfr",
    hfrId: "",
    regNo: "",
    regState: "Telangana",
    ownerRegNo: "",
    ownerCouncil: "",
    gstin: "",
  });
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tried, setTried] = React.useState(false);

  const e164 = toIndianE164(phone);
  const problems = [
    ...(name.trim().length < 2 ? ["The clinic's name"] : []),
    ...(city.trim().length < 2 ? ["The city"] : []),
    ...(pincode && !PINCODE.test(pincode) ? ["A 6-digit PIN code (or leave it empty)"] : []),
    ...(!e164 ? ["The clinic's phone number"] : []),
    ...idProblems(ids),
  ];
  const set = <K extends keyof ApplicationIds>(k: K, v: ApplicationIds[K]) => setIds((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (problems.length > 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      await post("/onboarding/clinic", {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        pincode: pincode.trim(),
        phone: e164,
        hfr_id: ids.idType === "hfr" ? ids.hfrId.trim() : "",
        establishment_reg_no: ids.idType === "state" ? ids.regNo.trim() : "",
        registration_state: ids.idType === "state" ? ids.regState : "",
        owner_reg_no: ids.ownerRegNo.trim(),
        owner_council: ids.ownerCouncil,
        gstin: ids.gstin.trim().toUpperCase(),
      });
      // A full load, so every part of the app sees the new membership; the
      // verification page is where the certificates go next.
      window.location.assign("/dashboard/verification");
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "That did not work. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-surface px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-line bg-surface-raised p-6 shadow-card sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-700">
          <Icon name="shield" className="h-5 w-5" />
        </span>
        <h1 className="mt-4 font-display text-xl font-semibold tracking-tight text-ink">Register your clinic</h1>
        <p className="mt-1 text-sm text-ink-muted">
          SAHVA verifies every clinic before it can take patients. It usually takes a working day; you can set up your
          doctors and hours meanwhile, and your 14-day free trial starts when you are approved.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-6" noValidate>
          <fieldset className="space-y-4">
            <legend className="mb-1 text-sm font-semibold text-ink">The clinic</legend>
            <Field label="Clinic name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sri Sai Clinic" />
            </Field>
            <Field label="Address">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="2-4-118, Station Road" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City" required>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Warangal" />
              </Field>
              <Field label="PIN code">
                <Input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="506001" />
              </Field>
            </div>
            <Field label="Clinic phone number" required hint="The number patients call.">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" inputMode="tel" />
            </Field>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-1 text-sm font-semibold text-ink">Government registration</legend>
            <div role="radiogroup" aria-label="Facility identifier" className="grid grid-cols-2 gap-2">
              {(
                [
                  ["hfr", "ABDM HFR ID", "Health Facility Registry"],
                  ["state", "State registration", "Clinical establishment no."],
                ] as const
              ).map(([v, label, sub]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={ids.idType === v}
                  onClick={() => set("idType", v)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition",
                    ids.idType === v ? "border-brand-600 bg-brand-50" : "border-line hover:bg-surface-sunken",
                  )}
                >
                  <span className="block text-sm font-semibold text-ink">{label}</span>
                  <span className="block text-xs text-ink-subtle">{sub}</span>
                </button>
              ))}
            </div>
            {ids.idType === "hfr" ? (
              <Field label="HFR ID" required hint="From facility.abdm.gov.in, on your HFR registration.">
                <Input value={ids.hfrId} onChange={(e) => set("hfrId", e.target.value.toUpperCase())} placeholder="IN3610000123" />
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <Field label="Registration number" required hint="From your clinical establishment certificate.">
                  <Input value={ids.regNo} onChange={(e) => set("regNo", e.target.value)} placeholder="TS/CE/2024/0457" />
                </Field>
                <Field label="Issued by" required>
                  <Select value={ids.regState} onChange={(e) => set("regState", e.target.value)}>
                    {STATES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Owner doctor's registration no." required>
                <Input value={ids.ownerRegNo} onChange={(e) => set("ownerRegNo", e.target.value)} placeholder="TSMC/48213" />
              </Field>
              <Field label="Registered with" required>
                <Select value={ids.ownerCouncil} onChange={(e) => set("ownerCouncil", e.target.value)}>
                  <option value="">Choose a council</option>
                  {COUNCILS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="GSTIN" hint="Optional — for GST invoices.">
              <Input value={ids.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} placeholder="36ABCDE1234F1Z5" />
            </Field>
          </fieldset>

          {tried && problems.length > 0 && (
            <div role="alert" className="rounded-xl bg-accent-amber/[0.08] px-3 py-2 text-sm text-ink">
              Still needed:
              <ul className="mt-1 list-disc pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-accent-rose/[0.07] px-3 py-2 text-sm text-ink">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={pending}>
            Submit for verification
          </Button>
          <p className="text-center text-xs text-ink-subtle">You will upload the registration certificates on the next screen.</p>
        </form>

        <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-ink-subtle">
          Signed in as <span className="font-medium text-ink">{email}</span>. Joining a clinic that already uses
          SAHVA? Don&rsquo;t register it again — ask its owner to invite this email from Settings → Staff.{" "}
          <button type="button" onClick={onSignOut} className="font-medium text-brand-700 underline">
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
