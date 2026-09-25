import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@sahva/types";
import { env } from "../config/env.js";

export type Db = SupabaseClient<Database>;

/**
 * RLS-enforcing client, scoped to one signed-in staff user.
 *
 * Every dashboard read and write goes through this. The user's JWT travels with
 * the request, so Postgres resolves `auth.uid()` and the policies in migration
 * 1500 decide which rows exist. The server does not filter by clinic itself —
 * it could forget; the database cannot.
 */
export function dbForUser(accessToken: string): Db {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * service_role client. **Bypasses RLS entirely.**
 *
 * Legitimate uses are narrow, and all of them are machine paths that carry no
 * user JWT: the telephony webhook (an inbound call has no session), the voice
 * orchestrator, and background workers.
 *
 * Rule for any code reached from here: the clinic_id must be derived from
 * something the caller could not forge — the dialed number, or a row already
 * fetched by id — and then passed explicitly. Tenant safety on this path rests
 * on the composite foreign keys in the schema, not on RLS.
 */
export const dbAdmin: Db = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);

/** Verifies a user access token and returns its subject. */
export async function verifyAccessToken(accessToken: string) {
  const { data, error } = await dbAdmin.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}
