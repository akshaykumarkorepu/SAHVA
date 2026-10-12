"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "./api";
import { supabase, isSupabaseConfigured } from "./supabase";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Short enough that a screen opened a minute later is current, long
        // enough that tab-hopping does not refetch everything.
        staleTime: 15_000,
        // Front-desk PCs sit on the dashboard all day; coming back to the
        // window is exactly when stale data would mislead.
        refetchOnWindowFocus: true,
        // A 4xx will not fix itself on retry, and retrying a 403 three times
        // just delays the honest error.
        retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      },
    },
  });
}

/**
 * One cache per browser tab, wiped whenever the signed-in user changes.
 *
 * Reception PCs and family phones are shared. Without the wipe, the next
 * person to sign in would briefly see the previous person's cached
 * appointments or medical record before their own loaded.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(makeClient);

  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    let userId: string | null | undefined;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (userId !== undefined && next !== userId) client.clear();
      userId = next;
    });
    return () => sub.subscription.unsubscribe();
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
