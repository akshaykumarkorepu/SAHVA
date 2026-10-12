"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Spinner } from "@/components/ui";

/**
 * Where Google OAuth and the email links land.
 *
 * The browser client is created with `detectSessionInUrl`, so supabase-js has
 * already consumed the fragment by the time this renders. All that is left is
 * to wait for the session to settle and forward to wherever the user was
 * headed — never to an arbitrary URL from the query string, which is how an
 * open redirect gets built by accident.
 */
export default function AuthCallbackPage() {
  return (
    <React.Suspense fallback={<Waiting />}>
      <Callback />
    </React.Suspense>
  );
}

function Waiting({ message = "Signing you in…" }: { message?: string }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-surface px-4">
      <div className="text-center">
        <Spinner />
        <p className="mt-4 text-sm text-ink-muted">{message}</p>
      </div>
    </main>
  );
}

/** Only same-origin, absolute-path destinations. Anything else goes home. */
function safeNext(raw: string | null): string {
  if (!raw) return "/me";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/me";
  return raw;
}

function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = React.useState<string | null>(null);

  React.useEffect(() => {
    const next = safeNext(params.get("next"));
    const providerError = params.get("error_description") ?? params.get("error");
    if (providerError) {
      setFailed(providerError);
      return;
    }

    let done = false;
    const finish = (to: string) => {
      if (done) return;
      done = true;
      router.replace(to);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish(next);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) finish(next);
    });

    // If nothing arrives, say so rather than spinning forever.
    const timeout = setTimeout(() => {
      if (!done) setFailed("We could not complete that sign-in.");
    }, 10_000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router, params]);

  if (failed) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-surface px-4">
        <div className="max-w-sm rounded-3xl border border-line bg-surface-raised p-8 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">Sign-in did not complete</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">{failed}</p>
          <a
            href="/signin"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-6 text-sm font-semibold text-on-brand transition hover:bg-brand-700"
          >
            Try again
          </a>
        </div>
      </main>
    );
  }

  return <Waiting />;
}
