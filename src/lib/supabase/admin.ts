import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses Row Level Security, so it is used for ONE
 * thing only: deleting the logged-in user's own login (auth.users), which
 * normal clients cannot do. Never use it to read or write case data.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Account deletion is not configured (SUPABASE_SERVICE_ROLE_KEY missing).");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
