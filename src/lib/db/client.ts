import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Supabase clients. `serviceClient` uses the service-role key for server-side
 * scripts and API routes (full access, no row-level auth in this single-tenant
 * exercise). Works with both classic JWT service_role keys and the newer
 * sb_secret_ keys — createClient takes whatever string is provided.
 */

let _service: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  // Tolerate a pasted REST endpoint or trailing slash — createClient wants the base URL.
  const url = env.supabaseUrl().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  if (!_service) {
    _service = createClient(url, env.supabaseServiceKey(), {
      auth: { persistSession: false },
    });
  }
  return _service;
}
