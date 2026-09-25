"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import type { Enums } from "@sahva/types";
import { supabase, isSupabaseConfigured } from "./supabase";
import { get, ApiError } from "./api";

export type ClinicContext = {
  id: string;
  name: string;
  city: string;
  timezone: string;
  default_language: Enums<"language_code">;
  settings: { ai_enabled: boolean; ai_may_cancel: boolean } | null;
};

type SessionState = {
  status: "loading" | "signed-out" | "ready" | "no-clinic" | "unconfigured";
  session: Session | null;
  clinic: ClinicContext | null;
  role: Enums<"staff_role"> | null;
  email: string | null;
  error: string | null;
  signOut: () => Promise<void>;
};

const Ctx = React.createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [clinic, setClinic] = React.useState<ClinicContext | null>(null);
  const [role, setRole] = React.useState<Enums<"staff_role"> | null>(null);
  const [status, setStatus] = React.useState<SessionState["status"]>(
    isSupabaseConfigured ? "loading" : "unconfigured",
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setStatus("signed-out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setClinic(null);
        setRole(null);
        setStatus("signed-out");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      try {
        // The clinic comes from the API, which reads clinic_members. The
        // browser never picks its own tenant.
        const c = await get<ClinicContext>("/clinic");
        if (cancelled) return;
        setClinic(c);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.isForbidden) {
          // Authenticated, but not a member of any clinic yet.
          setStatus("no-clinic");
          setError(err.message);
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load clinic");
        setStatus("ready");
      }
    })();

    // Role lives in the JWT-independent membership row; the API exposes it on
    // /clinic/me so the UI can hide what a receptionist may not do.
    get<{ role: Enums<"staff_role"> }>("/clinic/me")
      .then((m) => !cancelled && setRole(m.role))
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [session]);

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value: SessionState = {
    status,
    session,
    clinic,
    role,
    email: session?.user.email ?? null,
    error,
    signOut,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
}

/**
 * Client-side route guard.
 *
 * This is UX, not security — the API rejects unauthenticated requests
 * regardless. It exists so a signed-out user sees the login page instead of a
 * dashboard full of error states.
 */
export function useRequireSession() {
  const s = useSession();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (s.status === "signed-out") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [s.status, router, pathname]);

  return s;
}

/** True when the current user may change clinic configuration. */
export function useCanAdminister() {
  const { role } = useSession();
  return role === "owner" || role === "manager";
}
