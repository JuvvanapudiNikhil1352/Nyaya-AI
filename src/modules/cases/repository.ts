import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  defaultCaseTitle,
  uuidSchema,
  type CreateCaseInput,
  type UpdateCaseInput,
} from "@/lib/validation/cases";
import type { CaseRecord } from "@/types/case";

/**
 * Case data access. Every function receives a Supabase client acting as the
 * logged-in user, so Row Level Security guarantees users only touch their own
 * cases. Callers must obtain the user first (requireUser / getCurrentUser).
 */

const CASE_COLUMNS =
  "id, user_id, case_title, case_status, state, lender_type, problem_description, safety_concern, confirmed_at, created_at, updated_at";

export async function listCases(
  supabase: SupabaseClient,
  opts: { includeClosed?: boolean; limit?: number } = {},
): Promise<CaseRecord[]> {
  let q = supabase
    .from("cases")
    .select(CASE_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(Math.min(opts.limit ?? 100, 200));
  if (!opts.includeClosed) q = q.neq("case_status", "closed");
  const { data, error } = await q;
  if (error) throw dbError("listCases", error);
  return (data ?? []) as CaseRecord[];
}

/** Returns the case, or null if it doesn't exist or belongs to someone else. */
export async function getCase(supabase: SupabaseClient, id: string): Promise<CaseRecord | null> {
  if (!uuidSchema.safeParse(id).success) return null;
  const { data, error } = await supabase.from("cases").select(CASE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError("getCase", error);
  return data as CaseRecord | null;
}

export async function createCase(supabase: SupabaseClient, input: CreateCaseInput): Promise<CaseRecord> {
  await enforceRateLimit(supabase, "case:create");

  const { data, error } = await supabase
    .from("cases")
    .insert({
      case_title: input.case_title ?? defaultCaseTitle(),
      state: input.state,
      lender_type: input.lender_type,
      problem_description: input.problem_description ?? null,
    })
    .select(CASE_COLUMNS)
    .single();
  if (error) throw dbError("createCase", error);

  // Every case gets its own conversation for the chat (Phase 5).
  const conv = await supabase.from("conversations").insert({ case_id: data.id });
  if (conv.error) console.error("[cases] could not create conversation", { code: conv.error.code });

  return data as CaseRecord;
}

export async function updateCase(
  supabase: SupabaseClient,
  id: string,
  input: UpdateCaseInput,
): Promise<CaseRecord | null> {
  if (!uuidSchema.safeParse(id).success) return null;
  await enforceRateLimit(supabase, "case:update");

  const { closed, ...fields } = input;
  const patch: Record<string, unknown> = { ...fields };
  if (closed === true) patch.case_status = "closed";
  if (closed === false) {
    // Reopening returns the case to the information-gathering stage, so facts
    // are re-confirmed before any new analysis.
    patch.case_status = "intake";
    patch.confirmed_at = null;
  }

  const { data, error } = await supabase
    .from("cases")
    .update(patch)
    .eq("id", id)
    .select(CASE_COLUMNS)
    .maybeSingle();
  if (error) throw dbError("updateCase", error);
  return data as CaseRecord | null;
}

/**
 * Permanently deletes a case: its uploaded files in storage first, then the
 * case row (which removes all related records via ON DELETE CASCADE).
 * Returns false if the case was not found / not owned.
 */
export async function deleteCase(supabase: SupabaseClient, id: string): Promise<boolean> {
  if (!uuidSchema.safeParse(id).success) return false;
  await enforceRateLimit(supabase, "case:delete");

  const existing = await getCase(supabase, id);
  if (!existing) return false;

  const [docs, drafts] = await Promise.all([
    supabase.from("documents").select("storage_path").eq("case_id", id),
    supabase.from("generated_documents").select("storage_path").eq("case_id", id).not("storage_path", "is", null),
  ]);
  const docPaths = (docs.data ?? []).map((d) => d.storage_path as string);
  const draftPaths = (drafts.data ?? []).map((d) => d.storage_path as string);
  if (docPaths.length) {
    const { error } = await supabase.storage.from("case-documents").remove(docPaths);
    if (error) throw dbError("deleteCase:storage", error);
  }
  if (draftPaths.length) {
    const { error } = await supabase.storage.from("generated-documents").remove(draftPaths);
    if (error) throw dbError("deleteCase:storage", error);
  }

  const { data, error } = await supabase.from("cases").delete().eq("id", id).select("id");
  if (error) throw dbError("deleteCase", error);
  return (data ?? []).length > 0;
}

export type ActivityItem = {
  id: number;
  case_id: string | null;
  table_name: string;
  action: string;
  created_at: string;
};

export async function recentActivity(supabase: SupabaseClient, limit = 8): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, case_id, table_name, action, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw dbError("recentActivity", error);
  return (data ?? []) as ActivityItem[];
}

/** Logs the technical detail server-side; returns a generic error for the user. */
function dbError(where: string, error: { code?: string; message?: string }) {
  console.error(`[cases] ${where} failed`, { code: error.code });
  return new Error("A database error occurred. Please try again.");
}
