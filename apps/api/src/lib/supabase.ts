import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Factory to create a Supabase client scoped to a specific user's JWT.
 * This client is used for all requests that must be subject to RLS.
 */
export function createScopedClient(jwt: string): SupabaseClient {
  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });
}
