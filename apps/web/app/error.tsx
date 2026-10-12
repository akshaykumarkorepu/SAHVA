"use client";

import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * Catches render errors below the root layout. Without it an unhandled throw
 * shows the Next default, which tells a receptionist nothing about whether
 * their last action went through.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-5">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent-rose/10 text-accent-rose">
          <Icon name="warning" className="h-6 w-6" />
        </div>
        <h1 className="mt-5 font-display text-display-md text-ink">This page hit a problem</h1>
        <p className="mt-3 text-ink-muted">
          Nothing was saved from the step that failed. Try again — if it keeps happening, note the time and tell
          us.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-ink-subtle">Reference {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={reset} icon="activity">
            Try again
          </Button>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-2xl border border-line-strong px-4 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
