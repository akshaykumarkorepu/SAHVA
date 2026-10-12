"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isMockMode } from "@/lib/mock/flag";
import { ApiError, get, post } from "@/lib/api";
import { useAdminSession, type AdminMe } from "@/lib/admin/session";
import { Button, Field, Input } from "@/components/ui";
import { Icon } from "@/components/icons";

type Step =
  | { kind: "password" }
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

  // Signed in with a password but not the code yet (e.g. a reload mid-way).
  React.useEffect(() => {
    if (session.status === "needs-mfa" && step.kind === "password") void startSecondFactor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status]);

  async function startSecondFactor() {
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
    <main className="grid min-h-dvh place-items-center bg-surface-sunken px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface-raised p-8 shadow-card animate-scale-in">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-surface-inverse text-white">
            <Icon name="shield" className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-lg font-semibold tracking-tight text-ink">SAHVA Admin</p>
            <p className="text-xs text-ink-subtle">Restricted. Every action is recorded.</p>
          </div>
        </div>

        {isMockMode ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-xl bg-surface-sunken p-3 text-sm text-ink-muted">Mock mode — fixtures only, no sign-in.</p>
            <Button className="w-full" onClick={() => router.replace("/admin")}>
              Continue
            </Button>
          </div>
        ) : step.kind === "password" ? (
          <form onSubmit={onPassword} className="mt-6 space-y-4">
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
        ) : step.kind === "not-admin" ? (
          <div className="mt-6 space-y-4">
            <p role="alert" className="rounded-xl bg-accent-rose/[0.07] p-3 text-sm text-ink">
              This account is not a SAHVA admin. If you run a clinic, sign in on the clinic site instead.
            </p>
            <Button variant="secondary" className="w-full" onClick={() => void session.signOut().then(() => setStep({ kind: "password" }))}>
              Sign out
            </Button>
          </div>
        ) : (
          <form onSubmit={onCode} className="mt-6 space-y-4">
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
