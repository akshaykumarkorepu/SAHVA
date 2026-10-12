"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "../supabase";
import { isMockMode } from "../mock/flag";
import { ApiError, get } from "../api";

export type AdminMe = { email: string | null; role: string; full_name: string };

type State = {
  status: "loading" | "signed-out" | "needs-mfa" | "not-admin" | "ready" | "unconfigured";
  me: AdminMe | null;
  signOut: () => Promise<void>;
};

const Ctx = React.createContext<State | null>(null);

/**
 * The admin console's session. Separate from the clinic session: an admin is
 * not a clinic member, and on its own subdomain this is a separate browser
 * session altogether.
 *
 * "ready" only after the second factor (aal2) and the API confirming the
 * account is an active platform admin.
 */
export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<State["status"]>(
    isMockMode || isSupabaseConfigured ? "loading" : "unconfigured",
  );
  const [me, setMe] = React.useState<AdminMe | null>(null);

  const resolve = React.useCallback(async () => {
    if (isMockMode) {
      setMe(await get<AdminMe>("/admin/me"));
      setStatus("ready");
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setStatus("signed-out");
    const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.data?.currentLevel !== "aal2") return setStatus("needs-mfa");
    try {
      setMe(await get<AdminMe>("/admin/me"));
      setStatus("ready");
    } catch (e) {
      setStatus(e instanceof ApiError && e.status === 403 ? "not-admin" : "signed-out");
    }
  }, []);

  React.useEffect(() => {
    if (!isMockMode && !isSupabaseConfigured) return;
    void resolve();
    if (isMockMode) return;
    const { data: sub } = supabase.auth.onAuthStateChange(() => void resolve());
    return () => sub.subscription.unsubscribe();
  }, [resolve]);

  const signOut = React.useCallback(async () => {
    if (!isMockMode) await supabase.auth.signOut();
    setMe(null);
    setStatus("signed-out");
  }, []);

  return <Ctx.Provider value={{ status, me, signOut }}>{children}</Ctx.Provider>;
}

export function useAdminSession(): State {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAdminSession must be used inside <AdminSessionProvider>");
  return v;
}

/** Console pages: anything short of "ready" goes to the admin sign-in. */
export function useRequireAdmin(): State {
  const s = useAdminSession();
  const router = useRouter();
  React.useEffect(() => {
    if (s.status === "signed-out" || s.status === "needs-mfa") router.replace("/admin/signin");
  }, [s.status, router]);
  return s;
}
