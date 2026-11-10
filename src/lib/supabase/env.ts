/**
 * Public Supabase settings. These two values are safe in the browser:
 * the public (anon / publishable) key only allows what Row Level Security permits.
 *
 * NEXT_PUBLIC_ variables must be referenced literally so Next.js can inline them.
 */
export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  "The app is not connected to Supabase yet. Add the Supabase values to .env.local and restart the server.";

export function requireSupabaseConfig() {
  const config = getSupabaseConfig();
  if (!config) throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
  return config;
}
