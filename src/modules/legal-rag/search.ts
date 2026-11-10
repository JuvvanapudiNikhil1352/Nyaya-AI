import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedQuery } from "@/lib/ai/embeddings";
import type { CaseRecord } from "@/types/case";

/**
 * Retrieves passages from VERIFIED, in-force legal sources that apply to the
 * case's state and lender type. The database function enforces those rules,
 * so unverified text can never reach the AI.
 */

export type LegalPassage = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  jurisdiction: "IN" | "AP" | "TG";
  sourceUrl: string;
  documentVersion: string;
  sectionReference: string | null;
  content: string;
  similarity: number;
};

/** Informal lenders: "not sure" is searched as an individual lender (plus laws for any lender). */
export function lenderTypeForSearch(lenderType: CaseRecord["lender_type"]): string {
  return lenderType === "individual" || lenderType === "unsure" || lenderType === null ? "individual" : lenderType;
}

export async function searchLegal(
  supabase: SupabaseClient,
  query: string,
  scope: { state: "AP" | "TG"; lenderType: string },
  { matchCount = 8, minSimilarity = 0.35 } = {},
): Promise<LegalPassage[]> {
  const embedding = await embedQuery(query);
  const { data, error } = await supabase.rpc("match_legal_chunks", {
    query_embedding: JSON.stringify(embedding),
    p_state: scope.state,
    p_lender_type: scope.lenderType,
    match_count: matchCount,
    min_similarity: minSimilarity,
  });
  if (error) {
    console.error("[legal-rag] search failed", { code: error.code });
    throw new Error("Legal search failed. Please try again.");
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    chunkId: r.chunk_id as string,
    sourceId: r.source_id as string,
    sourceTitle: r.source_title as string,
    jurisdiction: r.jurisdiction as LegalPassage["jurisdiction"],
    sourceUrl: r.source_url as string,
    documentVersion: r.document_version as string,
    sectionReference: (r.section_reference as string | null) ?? null,
    content: r.content as string,
    similarity: Number(r.similarity),
  }));
}

/** Runs several questions and merges the results (best match per passage), most relevant first. */
export async function searchLegalMany(
  supabase: SupabaseClient,
  queries: string[],
  scope: { state: "AP" | "TG"; lenderType: string },
  opts?: { matchCount?: number; minSimilarity?: number; limit?: number },
): Promise<LegalPassage[]> {
  const best = new Map<string, LegalPassage>();
  for (const q of queries) {
    for (const p of await searchLegal(supabase, q, scope, opts)) {
      const prev = best.get(p.chunkId);
      if (!prev || p.similarity > prev.similarity) best.set(p.chunkId, p);
    }
  }
  return [...best.values()].sort((a, b) => b.similarity - a.similarity).slice(0, opts?.limit ?? 12);
}
