"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isMockMode } from "@/lib/mock/flag";
import { ApiError, get, post } from "@/lib/api";
import { useAdminSession, type AdminMe } from "@/lib/admin/session";
import { Button, Field, Input } from "@/components/ui";
import Image from "next/image";
import { Icon } from "@/components/icons";

type Step =
  | { kind: "password" }
  | { kind: "existing"; email: string | null }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "verify"; factorId: string }
  | { kind: "not-admin" };

/**
 * Admin sign-in: password, then a code from an authenticator app — always.
 * The first time, the account sets up its authenticator here. The console
 * opens only after the API confirms the account is an active SAHVA admin.
 */
export default function AdminSignIn() {
  const router = useRouter();
  const session = useAdminSession();
  const [step, setStep] = React.useState<Step>({ kind: "password" });
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Already signed in (and past the code): straight to the console.
  React.useEffect(() => {
    if (session.status === "ready") router.replace("/admin");
    if (session.status === "not-admin") setStep({ kind: "not-admin" });
  }, [session.status, router]);

  // A login is already saved in this browser but has not passed the code —
  // a reload mid-way, or a clinic or patient login on the same site. Never
  // carry on silently: say whose it is and let the person choose.
  React.useEffect(() => {
    if (session.status !== "needs-mfa" || step.kind !== "password") return;
    void supabase.auth.getUser().then(({ data }) => setStep({ kind: "existing", email: data.user?.email ?? null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status]);

  async function switchAccount() {
    await session.signOut();
    setEmail("");
    setPassword("");
    setError(null);
    setStep({ kind: "password" });
  }

  async function startSecondFactor() {
    // Only an admin account is taken into authenticator set-up.
    try {
      const who = await get<{ admin: boolean }>("/admin-eligibility");
      if (!who.admin) return setStep({ kind: "not-admin" });
    } catch (e) {
      return setError(e instanceof Error ? e.message : "Could not check admin access.");
    }
    const { data, error: e } = await supabase.auth.mfa.listFactors();
    if (e) return setError(e.message);
    const verified = data.totp.find((f) => f.status === "verified");
    if (verified) return setStep({ kind: "verify", factorId: verified.id });

    // A set-up abandoned half way leaves an unverified factor; clear it first.
    for (const f of data.all.filter((f) => f.factor_type === "totp" && f.status !== "verified")) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const en = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "SAHVA Admin" });
    if (en.error) return setError(en.error.message);
    setStep({ kind: "enroll", factorId: en.data.id, qr: en.data.totp.qr_code, secret: en.data.totp.secret });
  }

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setPending(false);
      return setError(
        authError.status === 429 ? "Too many attempts. Wait a few minutes." : "That email and password did not match.",
      );
    }
    await startSecondFactor();
    setPending(false);
  }

  async function onCode(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "enroll" && step.kind !== "verify") return;
    setPending(true);
    setError(null);
    const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({ factorId: step.factorId, code: code.trim() });
    if (mfaError) {
      setPending(false);
      return setError("That code did not match. Codes change every 30 seconds — try the current one.");
    }
    try {
      await get<AdminMe>("/admin/me");
      await post("/admin/sessions");
      router.replace("/admin");
    } catch (err) {
      setPending(false);
      if (err instanceof ApiError && err.status === 403) setStep({ kind: "not-admin" });
      else setError(err instanceof Error ? err.message : "Could not open the console.");
    }
  }

  return (
    <main className="min-h-dvh bg-surface lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <ConsoleStory />

      <section className="flex min-h-[calc(100dvh-0px)] flex-col px-5 py-10 sm:px-10 lg:min-h-dvh lg:justify-center">
        <div className="mx-auto w-full max-w-sm animate-fade-up">
          <p className="text-[12px] font-bold uppercase tracking-wider text-brand-700">Operations console</p>
          <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">
            {step.kind === "enroll" ? "Set up your authenticator" : step.kind === "verify" ? "Enter your code" : "Sign in to SAHVA Admin"}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">Restricted to SAHVA staff. Every action is recorded.</p>
          <Steps current={step.kind === "enroll" || step.kind === "verify" ? 2 : 1} />

          <div className="mt-6 rounded-3xl border border-line bg-surface-raised p-6 shadow-card sm:p-7">
        {isMockMode ? (
          <div className="space-y-4">
            <p className="rounded-xl bg-surface-sunken p-3 text-sm text-ink-muted">Mock mode — fixtures only, no sign-in.</p>
            <Button className="w-full" onClick={() => router.replace("/admin")}>
              Continue
            </Button>
          </div>
        ) : step.kind === "password" ? (
          <form onSubmit={onPassword} className="space-y-4">
            <Field label="Email" required>
              <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" required>
              <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <ErrorLine text={error} />}
            <Button type="submit" size="lg" className="w-full" loading={pending}>
              Continue
            </Button>
          </form>
        ) : step.kind === "existing" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              This browser is already signed in as <strong className="text-ink">{step.email ?? "another account"}</strong>.
            </p>
            {error && <ErrorLine text={error} />}
            <Button size="lg" className="w-full" loading={pending} onClick={() => { setPending(true); void startSecondFactor().finally(() => setPending(false)); }}>
              Continue as {step.email ?? "this account"}
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => void switchAccount()}>
              Use a different account
            </Button>
          </div>
        ) : step.kind === "not-admin" ? (
          <div className="space-y-4">
            <p role="alert" className="rounded-xl bg-accent-rose/[0.07] p-3 text-sm text-ink">
              This account is not a SAHVA admin. If you run a clinic, sign in on the clinic site instead.
            </p>
            <Button variant="secondary" className="w-full" onClick={() => void switchAccount()}>
              Sign out and use a different account
            </Button>
          </div>
        ) : (
          <form onSubmit={onCode} className="space-y-4">
            {step.kind === "enroll" ? (
              <>
                <p className="text-sm text-ink-muted">
                  Admin accounts need a second step. Scan this with an authenticator app (Google Authenticator, Microsoft
                  Authenticator, 1Password), then enter the 6-digit code.
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={step.qr} alt="QR code for your authenticator app" className="mx-auto h-44 w-44 rounded-xl border border-line bg-white p-2" />
                <p className="text-center text-xs text-ink-subtle">
                  Can&rsquo;t scan? Enter this key: <span className="select-all font-mono text-ink">{step.secret}</span>
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-muted">Enter the 6-digit code from your authenticator app.</p>
            )}
            <Field label="Code" required>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="text-center font-mono text-lg tracking-[0.4em]"
              />
            </Field>
            {error && <ErrorLine text={error} />}
            <Button type="submit" size="lg" className="w-full" loading={pending} disabled={code.length !== 6}>
              Verify and open console
            </Button>
          </form>
        )}
          </div>
          <p className="mt-6 text-center text-xs text-ink-subtle">
            Clinic staff sign in on the clinic site, not here.
          </p>
        </div>
      </section>
    </main>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="rounded-xl bg-accent-rose/[0.07] px-3 py-2 text-sm text-ink">
      {text}
    </p>
  );
}

function Steps({ current }: { current: 1 | 2 }) {
  const items = ["Password", "Authenticator code"];
  return (
    <ol className="mt-5 flex items-center gap-3 text-xs" aria-label="Sign-in steps">
      {items.map((label, i) => {
        const n = (i + 1) as 1 | 2;
        const done = n < current;
        const on = n === current;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={on ? "step" : undefined}>
            <span
              className={
                "grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold " +
                (done ? "bg-brand-600 text-on-brand" : on ? "bg-surface-inverse text-white" : "border border-line-strong text-ink-subtle")
              }
            >
              {done ? <Icon name="check" className="h-3.5 w-3.5" /> : n}
            </span>
            <span className={on ? "font-medium text-ink" : "text-ink-subtle"}>{label}</span>
            {i === 0 && <span aria-hidden className="mx-1 h-px w-6 bg-line-strong" />}
          </li>
        );
      })}
    </ol>
  );
}

const PILLARS: { icon: "shield" | "rupee" | "eyeOff"; title: string; body: string }[] = [
  { icon: "shield", title: "Verify every clinic", body: "Registration and the doctor's council number checked before anything goes live." },
  { icon: "rupee", title: "Money with two keys", body: "Ledger, reconciliation with Razorpay, GST invoices, and large refunds approved by a second admin." },
  { icon: "eyeOff", title: "Patients stay with clinics", body: "Counts, never names. Records open only when a clinic owner grants access, and they see who looked." },
];

/**
 * The left half: what this console is for, on the same dark ink as its
 * navigation rail, so nobody mistakes it for the clinic site.
 */
function ConsoleStory() {
  return (
    <aside className="relative overflow-hidden bg-surface-inverse px-5 py-8 text-white sm:px-10 lg:flex lg:min-h-dvh lg:flex-col lg:justify-between lg:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(36rem_28rem_at_0%_0%,rgb(var(--brand-500)/0.28),transparent_60%),radial-gradient(28rem_22rem_at_100%_100%,rgb(var(--accent-sky)/0.14),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgb(255_255_255)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_30%_30%,black,transparent_75%)]"
      />

      <div className="relative flex items-center gap-2.5">
        <span className="relative h-9 w-9 shrink-0 rounded-xl bg-white/95 p-1">
          <Image src="/brand/sahva-logo.png" alt="" fill className="object-contain p-1" priority />
        </span>
        <span>
          <span className="block font-display text-[16px] font-bold tracking-tight">SAHVA</span>
          <span className="block text-[11px] leading-none text-white/60">Admin console</span>
        </span>
      </div>

      <div className="relative mt-10 hidden max-w-lg lg:block">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/80">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand-400" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
          </span>
          Restricted access
        </div>
        <h2 className="mt-6 font-display text-[40px] font-semibold leading-[1.08] tracking-tight">
          Run the platform.
          <br />
          <span className="text-brand-400">Leave the patients to the clinics.</span>
        </h2>
        <ul className="mt-10 space-y-5">
          {PILLARS.map((p) => (
            <li key={p.title} className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06]">
                <Icon name={p.icon} className="h-5 w-5 text-brand-400" />
              </span>
              <span>
                <span className="block font-semibold">{p.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-white/65">{p.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative mt-10 hidden text-xs text-white/50 lg:block">
        Authenticator required on every sign-in · Every action in the audit log · Sessions on record
      </p>
    </aside>
  );
}
