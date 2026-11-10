"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteAccount } from "@/modules/account/delete-account";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  full_name: z.string().trim().min(1, { error: "Enter your name." }).max(100, { error: "Name must be 100 characters or fewer." }),
  preferred_language: z.enum(["en"], { error: "Only English is available right now." }),
});

/**
 * Deletes the account. The user must type DELETE to confirm.
 * On success the session is cleared and the user is sent to the home page.
 */
export async function deleteAccountAction(confirmation: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (confirmation.trim() !== "DELETE") return { error: "Type DELETE to confirm." };
  const supabase = await createClient();
  try {
    await deleteAccount(supabase, createAdminClient(), user.id);
  } catch (e) {
    if (e instanceof RateLimitError) return { error: e.message };
    console.error("[account] deletion failed", e instanceof Error ? e.message : "unknown");
    return { error: e instanceof Error && /files|account/.test(e.message) ? e.message : "Something went wrong. Please try again." };
  }
  await supabase.auth.signOut();
  redirect("/?account=deleted");
}

export type ProfileFormState = { error?: string; success?: string; fieldErrors?: Partial<Record<string, string[]>> };

export async function updateProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    full_name: formData.get("full_name"),
    preferred_language: formData.get("preferred_language") ?? "en",
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  try {
    await enforceRateLimit(supabase, "profile:update");
  } catch (e) {
    return { error: e instanceof RateLimitError ? e.message : "Please try again." };
  }
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) {
    console.error("[settings] profile update failed", { code: error.code });
    return { error: "Could not save your profile. Please try again." };
  }
  // Keep the name shown in the sidebar in sync.
  await supabase.auth.updateUser({ data: { full_name: parsed.data.full_name } });
  revalidatePath("/", "layout");
  return { success: "Profile saved." };
}
