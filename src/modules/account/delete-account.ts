import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enforceRateLimit } from "@/lib/security/rate-limit";

/**
 * Permanently deletes the logged-in user's account and data.
 * 1. Their uploaded files are removed from storage (as the user, so RLS
 *    guarantees only their own files can be touched).
 * 2. Their login is deleted. Every table row (profile, cases, facts,
 *    documents, analyses, plans, audit and rate-limit rows) is removed by
 *    ON DELETE CASCADE from auth.users.
 */
export async function deleteAccount(supabase: SupabaseClient, admin: SupabaseClient, userId: string) {
  await enforceRateLimit(supabase, "account:delete");

  const [docs, drafts] = await Promise.all([
    supabase.from("documents").select("storage_path").eq("user_id", userId),
    supabase.from("generated_documents").select("storage_path").not("storage_path", "is", null),
  ]);
  if (docs.error || drafts.error) throw new Error("Could not list your files. Nothing was deleted.");

  const remove = async (bucket: string, paths: string[]) => {
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) throw new Error("Could not delete your files. Your account was not deleted; please try again.");
    }
  };
  await remove("case-documents", (docs.data ?? []).map((d) => d.storage_path as string));
  await remove("generated-documents", (drafts.data ?? []).map((d) => d.storage_path as string));

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[account] delete user failed", { status: error.status });
    throw new Error("Your files were deleted, but your account could not be. Please try again.");
  }
}
