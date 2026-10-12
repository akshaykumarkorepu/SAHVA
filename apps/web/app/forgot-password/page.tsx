"use client";

import * as React from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { isMockMode } from "@/lib/mock/flag";
import { Button, Field, Input } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * Password reset request.
 *
 * Always reports success, even for an address with no account. Saying "no such
 * user" here would turn this form into a way to test whether someone is a
 * patient at a particular clinic, which is a disclosure in itself.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const configured = isSupabaseConfigured && !isMockMode;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    if (configured) {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth/callback?next=/me`,
      });
    }
    setPending(false);
    setSent(true);
  }

  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-surface px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_24rem_at_15%_-10%,rgb(var(--brand-500)/0.12),transparent_60%)]"
      />
      <Link
        href="/signin"
        className="absolute left-4 top-4 z-30 inline-flex items-center gap-2 text-sm font-medium text-ink-muted transition hover:text-ink"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
        Back to sign in
      </Link>

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-line bg-surface-raised p-8 shadow-lift sm:p-10">
        <span
          aria-hidden
          className="inline-grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 font-display text-lg font-extrabold text-white"
        >
          S
        </span>

        {sent ? (
          <>
            <h1 className="mt-5 font-display text-display-md text-ink">Check your email</h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              If an account exists for <strong className="text-ink">{email}</strong>, a reset link
              is on its way. It expires in an hour.
            </p>
            {!configured && (
              <p className="mt-4 rounded-xl border border-accent-sky/30 bg-accent-sky/[0.07] p-3 text-[13px] text-ink">
                Nothing was actually sent — Supabase is not configured in this environment.
              </p>
            )}
            <Button variant="secondary" size="lg" className="mt-7 w-full" onClick={() => setSent(false)}>
              Use a different email
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-5 font-display text-display-md text-ink">Reset your password</h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              We&rsquo;ll email you a link to set a new one.
            </p>

            <form onSubmit={onSubmit} className="mt-7 space-y-5">
              <Field label="Email" required>
                <Input
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="text-base"
                />
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={pending}>
                Send reset link
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
