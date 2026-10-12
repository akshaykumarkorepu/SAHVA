"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "./supabase";
import { isMockMode } from "./mock/flag";

/** Tables published in migration 20261012000200. */
const LIVE_TABLES = ["appointments", "action_items", "messages"] as const;

/** A burst of changes (a 5-patient reschedule) becomes one refetch. */
const DEBOUNCE_MS = 400;

export type LiveStatus = "off" | "connecting" | "live" | "reconnecting";

/**
 * Keeps every open screen current when another person — or the AI on a
 * call — changes this clinic's appointments, action items or messages.
 *
 * Events are a hint, never data: each one only marks the cache stale so the
 * screens refetch from the API, which stays the source of truth. That makes
 * dropped, duplicated or out-of-order events harmless, and it is why a
 * reconnect always triggers a refetch — whatever changed while the socket was
 * down is picked up then.
 *
 * Tenant scoping is enforced twice: the `clinic_id` filter here, and RLS,
 * which Supabase Realtime applies to every change before delivering it.
 */
export function useLiveClinic(clinicId: string | null | undefined): LiveStatus {
  const client = useQueryClient();
  const [status, setStatus] = React.useState<LiveStatus>("off");

  React.useEffect(() => {
    if (!clinicId || isMockMode || !isSupabaseConfigured) {
      setStatus("off");
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let everConnected = false;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void client.invalidateQueries({ queryKey: ["api"] }), DEBOUNCE_MS);
    };

    setStatus("connecting");
    let channel = supabase.channel(`clinic:${clinicId}`);
    for (const table of LIVE_TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `clinic_id=eq.${clinicId}` },
        refresh,
      );
    }
    channel.subscribe((state) => {
      if (state === "SUBSCRIBED") {
        // Anything that changed while disconnected was missed; reconcile.
        if (everConnected) refresh();
        everConnected = true;
        setStatus("live");
      } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
        setStatus(everConnected ? "reconnecting" : "connecting");
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [clinicId, client]);

  return status;
}
