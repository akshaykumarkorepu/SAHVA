"use client";

import * as React from "react";
import { ApiError, post } from "@/lib/api";
import { toIndianE164 } from "@/lib/phone";
import { PRICE } from "@/lib/pricing";
import { Button, Field, Input } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * First screen for a new owner: name the clinic, and the trial starts.
 *
 * Shown to any signed-in staff account without a clinic. Someone waiting on
 * an invite sees it too, so it says how to join an existing clinic instead.
 */
export function ClinicSetup({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const e164 = toIndianE164(phone);
  const ready = name.trim().length >= 2 && city.trim().length >= 2 && !!e164;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    try {
      await post("/onboarding/clinic", { name: name.trim(), city: city.trim(), phone: e164 });
      // The session resolves the clinic on load; a full reload is the
      // simplest way to make every part of the app see the new membership.
      window.location.assign("/dashboard/settings/doctors");
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "That did not work. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-surface px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface-raised p-8 shadow-card animate-scale-in">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-700">
          <Icon name="sparkles" className="h-5 w-5" />
        </span>
        <h1 className="mt-4 font-display text-xl font-semibold tracking-tight text-ink">Set up your clinic</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your {PRICE.trialDays}-day free trial starts now. No card needed.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Clinic name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sri Sai Clinic" />
          </Field>
          <Field label="City" required>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Warangal" />
          </Field>
          <Field
            label="Clinic phone number"
            required
            hint={phone && !e164 ? "A 10-digit mobile number, like 98765 43210." : "The number patients call."}
          >
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" inputMode="tel" />
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-accent-rose/[0.07] px-3 py-2 text-sm text-ink">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={pending} disabled={!ready}>
            Create clinic and start trial
          </Button>
        </form>

        <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-ink-subtle">
          Signed in as <span className="font-medium text-ink">{email}</span>. Joining a clinic that already uses
          SAHVA? Don&rsquo;t create one — ask its owner to invite this email from Settings → Staff.{" "}
          <button type="button" onClick={onSignOut} className="font-medium text-brand-700 underline">
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
