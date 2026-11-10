import type { NextRequest } from "next/server";
import { authenticate, checkMutationRequest, handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { createClient } from "@/lib/supabase/server";
import { getCase } from "@/modules/cases/repository";
import { confirmSummary, ConfirmationError } from "@/modules/facts/repository";

/**
 * POST /api/cases/[id]/confirm — the borrower confirms the case summary.
 * Missing information does not block confirmation; it is returned so the
 * analysis can state its limitations. Unresolved disputes do block it (409).
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/cases/[id]/confirm">) {
  const blocked = checkMutationRequest(request);
  if (blocked) return blocked;
  const user = await authenticate();
  if (user instanceof Response) return user;
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const c = await getCase(supabase, id);
    if (!c) return jsonError(404, "Case not found.");
    if (c.case_status === "closed") return jsonError(409, "This case is closed. Reopen it first.");
    const { missing } = await confirmSummary(supabase, c);
    return jsonOk({ confirmed: true, missing });
  } catch (e) {
    if (e instanceof ConfirmationError) return jsonError(409, e.message);
    return handleRouteError(e);
  }
}
