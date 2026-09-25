"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Button, Spinner } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
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
    <main className="flex min-h-screen items-center justify-center bg-ink-100/40 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span
            aria-hidden
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600 text-xl font-bold text-white"
          >
            S
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink-900">SAHVA</h1>
          <p className="mt-1 text-sm text-ink-500">Clinic staff sign in</p>
        </div>

        {!isSupabaseConfigured ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            <p className="font-medium text-amber-900">Supabase is not configured.</p>
            <p className="mt-2">
              Set <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,
              then restart. See <code className="rounded bg-amber-100 px-1">docs/setup.md</code>.
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="rounded-xl border border-ink-100 bg-white p-6 shadow-card"
          >
            <label className="block text-sm font-medium text-ink-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-ink-300 px-3 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600"
            />

            <label className="mt-4 block text-sm font-medium text-ink-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-ink-300 px-3 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600"
            />

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <Button type="submit" disabled={pending} className="mt-6 w-full">
              {pending ? "Signing in…" : "Sign in"}
            </Button>

            <p className="mt-4 text-center text-xs text-ink-500">
              Accounts are created by invitation. Ask your clinic owner.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-ink-100/40"><Spinner /></div>}>
      <LoginForm />
    </React.Suspense>
  );
}
