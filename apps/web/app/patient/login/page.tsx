"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Button, Field, Input, Spinner } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { STRINGS, type Lang } from "@/lib/portal/i18n";

function PatientLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/me";

  const [lang, setLang] = React.useState<Lang>("te");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const t = STRINGS[lang];
  const L = lang === "te";

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
      setError(
        L ? "ఈమెయిల్ లేదా పాస్‌వర్డ్ సరిపోలలేదు." : "That email and password did not match.",
      );
      return;
    }
    router.replace(next);
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-surface px-4 py-10">
      <div className="absolute right-4 top-4 flex gap-2">
        <button
          onClick={() => setLang(L ? "en" : "te")}
          className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
        >
          {t.language}
        </button>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm animate-fade-up">
        <div className="text-center">
          <span
            aria-hidden
            className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 font-display text-lg font-extrabold text-white shadow-glow"
          >
            S
          </span>
          <h1 className="mt-5 font-display text-display-md text-ink">
            {L ? "మీ ఆరోగ్య రికార్డు" : "Your health record"}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {L
              ? "మీ అపాయింట్‌మెంట్లు, మందులు మరియు వైద్య చరిత్ర చూడండి."
              : "See your appointments, prescriptions and medical history."}
          </p>
        </div>

        {!isSupabaseConfigured ? (
          <div className="mt-8 rounded-2xl border border-accent-amber/25 bg-accent-amber/[0.07] p-5 text-sm text-ink">
            Supabase is not configured.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Field label={L ? "ఈమెయిల్" : "Email"} required>
              <Input
                type="email"
                required
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="text-base"
              />
            </Field>

            <Field label={L ? "పాస్‌వర్డ్" : "Password"} required>
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  required
                  autoComplete="current-password"
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
              {pending ? (L ? "సైన్ ఇన్ అవుతోంది…" : "Signing in…") : L ? "సైన్ ఇన్" : "Sign in"}
            </Button>
          </form>
        )}

        <div className="mt-8 rounded-2xl border border-line bg-surface-sunken/60 p-4 text-center">
          <p className="text-sm text-ink-muted">
            {L ? "ఇంకా ఖాతా లేదా?" : "No account yet?"}
          </p>
          <p className="mt-1 text-sm text-ink">
            {L
              ? "క్లినిక్ మీకు WhatsAppలో పంపిన లింక్ తెరిచి, అక్కడ పాస్‌వర్డ్ సెట్ చేయండి."
              : "Open the link your clinic sent on WhatsApp and set a password there."}
          </p>
          <Link href="/" className="mt-3 inline-block text-xs font-medium text-brand-600">
            {L ? "హోమ్‌కి వెళ్లండి" : "Back to home"}
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function PatientLoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="grid min-h-[100dvh] place-items-center bg-surface">
          <Spinner />
        </div>
      }
    >
      <PatientLogin />
    </React.Suspense>
  );
}
