import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { requireSupabaseConfig } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Acts as the logged-in user, so Row Level Security applies to every query.
 * Create a new client per request — never share one between requests.
 */
export async function createClient() {
  const { url, anonKey } = requireSupabaseConfig();
  // User data must only ever be read at request time. Also required because the
  // Supabase client reads the current time (token expiry), which Next.js forbids
  // during prerendering / prefetching.
  await connection();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components can't set cookies. Safe to ignore: the proxy
          // refreshes the session on every request.
        }
      },
    },
  });
}
