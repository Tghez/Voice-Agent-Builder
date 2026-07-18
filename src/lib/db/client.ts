import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase clients. `serviceClient` uses the service-role key for server-side
 * scripts and API routes (full access, no row-level auth in this single-tenant
 * exercise). Works with both classic JWT service_role keys and the newer
 * sb_secret_ keys — createClient takes whatever string is provided.
 */

let _service: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  // Tolerate a pasted REST endpoint or trailing slash — createClient wants the base URL.
  const baseUrl = url.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  if (!_service) {
    _service = createClient(baseUrl, key, { auth: { persistSession: false } });
  }
  return _service;
}
