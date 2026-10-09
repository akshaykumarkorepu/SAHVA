"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Button, Field, Input, Spinner } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(next);
    });
  }, [router, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);

    if (authError) {
      // Deliberately not distinguishing "no such user" from "wrong password" —
      // that difference tells an attacker which emails are staff accounts.
      setError("That email and password did not match.");
      return;
    }
    router.replace(next);
  }

  return (
    <main className="relative grid min-h-[100dvh] lg:grid-cols-2">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 font-display text-lg font-extrabold text-white shadow-glow"
            >
              S
            </span>
            <span>
              <span className="block font-display text-base font-bold tracking-tight text-ink">
                SAHVA
              </span>
              <span className="block text-[11px] text-ink-subtle">AI receptionist</span>
            </span>
          </Link>

          <h1 className="mt-8 font-display text-display-md text-ink">Welcome back</h1>
          <p className="mt-2 text-sm text-ink-muted">Sign in to your clinic dashboard.</p>

          {!isSupabaseConfigured ? (
            <div className="mt-8 rounded-2xl border border-accent-amber/25 bg-accent-amber/[0.07] p-5">
              <Icon name="warning" className="h-5 w-5 text-accent-amber" />
              <p className="mt-3 text-sm font-semibold text-ink">Supabase is not configured.</p>
              <p className="mt-1.5 text-sm text-ink-muted">
                Set the <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-xs">NEXT_PUBLIC_SUPABASE_*</code>{" "}
                variables and restart. See <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-xs">docs/setup.md</code>.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <Field label="Email" required>
                <Input
                  type="email"
                  required
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@clinic.in"
                />
              </Field>

              <Field label="Password" required>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-subtle transition hover:bg-surface-sunken hover:text-ink"
                  >
                    <Icon name={showPassword ? "close" : "search"} className="h-4 w-4" />
                  </button>
                </div>
              </Field>

              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-accent-rose/25 bg-accent-rose/[0.07] px-3.5 py-3 text-sm text-ink animate-scale-in"
                >
                  <Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0 text-accent-rose" />
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" loading={pending} className="w-full">
                {pending ? "Signing in…" : "Sign in"}
              </Button>

              <p className="pt-2 text-center text-xs text-ink-subtle">
                Accounts are created by invitation. Ask your clinic owner.
              </p>
            </form>
          )}
        </div>
      </div>

      {/* Brand side — desktop only; on a phone it would just push the form down. */}
      <aside className="relative hidden overflow-hidden border-l border-line bg-surface-sunken lg:block">
        <div className="absolute inset-0 aurora" aria-hidden />
        <div className="absolute inset-0 grid-fade opacity-40" aria-hidden />

        <div className="relative flex h-full flex-col justify-center px-14">
          <blockquote className="max-w-md animate-fade-up">
            <p className="font-display text-display-md text-ink">
              &ldquo;No patient call goes unanswered, day or night.&rdquo;
            </p>
            <footer className="mt-6 text-sm text-ink-muted">
              What clinic owners actually want — in their words, not ours.
            </footer>
          </blockquote>

          <div className="mt-12 grid max-w-md gap-3">
            {[
              { icon: "calls" as const, t: "Every call answered, 24/7" },
              { icon: "appointments" as const, t: "Booked off live availability" },
              { icon: "shield" as const, t: "Never cancels a patient silently" },
            ].map((f, i) => (
              <div
                key={f.t}
                className="flex animate-fade-up items-center gap-3 rounded-2xl border border-line bg-surface-raised/70 px-4 py-3.5 backdrop-blur"
                style={{ animationDelay: `${120 + i * 90}ms` }}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 ring-1 ring-inset ring-brand-500/20">
                  <Icon name={f.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="text-sm font-medium text-ink">{f.t}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </main>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="grid min-h-[100dvh] place-items-center bg-surface">
          <Spinner />
        </div>
      }
    >
      <LoginForm />
    </React.Suspense>
  );
}
