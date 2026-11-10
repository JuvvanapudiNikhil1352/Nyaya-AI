import "server-only";
import { AIConfigError, AIUnavailableError } from "./llm";

/**
 * Gemini text embeddings (free tier) for legal search. 1536 dimensions to
 * match legal_chunks.embedding. Documents are embedded by the ingestion
 * script with task type RETRIEVAL_DOCUMENT; questions here use RETRIEVAL_QUERY.
 */

export const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_MODEL = "gemini-embedding-2";

export async function embedQuery(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new AIConfigError("Legal search needs GEMINI_API_KEY.");
  const model = process.env.GEMINI_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
        body: JSON.stringify({
          content: { parts: [{ text: text.slice(0, 8000) }] },
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
      });
    } catch {
      continue; // network / timeout: retry once
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === 0 && res.status >= 500) continue;
      throw new AIUnavailableError("Legal search is busy right now. Please try again in a moment.");
    }
    if (!res.ok) {
      console.error("[embeddings] request rejected", { status: res.status, model });
      throw new AIConfigError(`Embedding request failed (${res.status}).`);
    }
    const values: unknown = (await res.json())?.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
      throw new AIConfigError("Unexpected embedding size. Check GEMINI_EMBEDDING_MODEL.");
    }
    return values as number[];
  }
  throw new AIUnavailableError("Legal search is busy right now. Please try again in a moment.");
}
