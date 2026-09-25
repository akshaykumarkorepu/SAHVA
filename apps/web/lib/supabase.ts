"use client";

import { createClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client — used ONLY for authentication.
 *
 * All data goes through the API (lib/api.ts), never straight from the browser
 * to Postgres. That keeps one place where tenancy, validation and audit
 * logging happen, rather than two.
 *
 * This uses the anon key, which is public by design and safe to ship. The
 * service-role key must never appear in this app.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "sahva.auth",
  },
});
