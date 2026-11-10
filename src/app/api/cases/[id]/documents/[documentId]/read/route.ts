import type { NextRequest } from "next/server";
import { z } from "zod";
import { AIConfigError, AIUnavailableError } from "@/lib/ai/llm";
import { authenticate, checkMutationRequest, handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { createClient } from "@/lib/supabase/server";
import { getCase } from "@/modules/cases/repository";
import { DocumentError, readDocument } from "@/modules/documents/repository";

// Reading a PDF or photo can take a while on the free tier, plus a fallback model.
export const maxDuration = 90;

/**
 * POST /api/cases/[id]/documents/[documentId]/read — read the document with AI.
 * Details found are added to the case as unverified. If the AI is busy:
 * 503 with `retryable: true`; the document is kept and can be read later.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/cases/[id]/documents/[documentId]/read">) {
  const blocked = checkMutationRequest(request);
  if (blocked) return blocked;
  const user = await authenticate();
  if (user instanceof Response) return user;

  try {
    const { id, documentId } = await ctx.params;
    if (!z.uuid().safeParse(documentId).success) return jsonError(404, "Document not found.");
    const supabase = await createClient();
    const c = await getCase(supabase, id);
    if (!c) return jsonError(404, "Case not found.");
    if (c.case_status === "closed") return jsonError(409, "This case is closed. Reopen it first.");

    const { document, factsAdded } = await readDocument(supabase, c, documentId);
    return jsonOk({ document, facts_added: factsAdded });
  } catch (e) {
    if (e instanceof DocumentError) return jsonError(e.status, e.message);
    if (e instanceof AIUnavailableError) {
      return jsonOk({ error: "The document reader is busy right now. Your file is saved — try reading it again in a few minutes.", retryable: true }, 503);
    }
    if (e instanceof AIConfigError) {
      console.error("[documents] AI configuration problem:", e.message);
      return jsonError(503, "Document reading is not set up yet.");
    }
    return handleRouteError(e);
  }
}
