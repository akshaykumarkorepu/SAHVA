"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { isMockMode } from "@/lib/mock/flag";
import { get, ApiError } from "@/lib/api";
import type { Lang } from "./i18n";

export type PatientMe = {
  patient: {
    id: string;
    full_name: string;
    phone_e164: string;
    preferred_language: Lang | "hi";
    date_of_birth: string | null;
    approx_age_years: number | null;
    sex: string;
  };
  clinic: {
    id: string;
    name: string;
    phone_e164: string;
    address_line: string | null;
    landmark: string | null;
    city: string;
    pincode: string | null;
    map_url: string | null;
    timezone: string;
  };
  upcoming: PatientAppt[];
  past: PatientAppt[];
};

export type PatientAppt = {
  id: string;
  starts_at: string;
  status: string;
  reason: string | null;
  doctor_name: string;
  doctor_specialty: string;
  doctor_colour: string;
  consult_fee_paise: number | null;
  timezone: string;
};

type State = {
  status: "loading" | "signed-out" | "ready" | "not-a-patient" | "unconfigured";
  session: Session | null;
  me: PatientMe | null;
  error: string | null;
  reload: () => void;
  signOut: () => Promise<void>;
};

const Ctx = React.createContext<State | null>(null);

/**
 * Patient session.
 *
 * Separate from the staff provider: it resolves a patient record rather than a
 * clinic membership, and the two must never be confused — a patient signing in
 * should never hit a staff endpoint, and vice versa.
 */
export function PatientSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [me, setMe] = React.useState<PatientMe | null>(null);
  const [status, setStatus] = React.useState<State["status"]>(
    isMockMode || isSupabaseConfigured ? "loading" : "unconfigured",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    // Mock mode has no auth provider; /me below is served by the mock.
    if (isMockMode || !isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setStatus("signed-out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setMe(null);
        setStatus("signed-out");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (!session && !isMockMode) return;
    let cancelled = false;

    get<PatientMe>("/me")
      .then((d) => {
        if (cancelled) return;
        setMe(d);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.isForbidden) {
          setStatus("not-a-patient");
          setError(err.message);
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load your record");
        setStatus("ready");
      });

    return () => {
      cancelled = true;
    };
  }, [session, nonce]);

  const value: State = {
    status,
    session,
    me,
    error,
    reload: () => setNonce((n) => n + 1),
    signOut: async () => {
      if (isMockMode) return;
      await supabase.auth.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePatientSession(): State {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("usePatientSession must be used inside <PatientSessionProvider>");
  return v;
}

/** Sends a signed-out visitor to the patient sign-in page. */
export function useRequirePatient() {
  const s = usePatientSession();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (s.status === "signed-out") {
      router.replace(`/signin?role=patient&next=${encodeURIComponent(pathname)}`);
    }
  }, [s.status, router, pathname]);

  return s;
}
