import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};
export const hasSupabase = Boolean(env.url && env.anonKey && env.serviceKey);

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient() {
  return createClient(env.url, env.serviceKey, noPersist);
}

export function anonClient() {
  return createClient(env.url, env.anonKey, noPersist);
}

export type TestUser = { id: string; email: string; client: SupabaseClient };

/** Creates a confirmed throwaway user (no email is sent) and signs them in. */
export async function createTestUser(fullName = "Test User"): Promise<TestUser> {
  const admin = adminClient();
  const email = `nyaya-test-${randomUUID()}@example.com`;
  const password = `Pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn failed: ${signInError.message}`);
  return { id: data.user.id, email, client };
}

export async function deleteTestUser(user?: TestUser) {
  if (!user) return;
  await adminClient().auth.admin.deleteUser(user.id);
}
