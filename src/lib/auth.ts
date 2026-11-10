import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Data Access Layer for the current user.
 * getUser() asks the Supabase Auth server to confirm the session,
 * so the result can be trusted for authorization decisions.
 * `cache` makes repeated calls in one request hit Supabase only once.
 */
export const getCurrentUser = cache(async () => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

/** Use at the start of every protected server action, route handler or data fetch. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
