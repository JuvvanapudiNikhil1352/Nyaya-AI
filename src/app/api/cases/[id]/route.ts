import type { NextRequest } from "next/server";
import {
  authenticate,
  checkMutationRequest,
  handleRouteError,
  jsonError,
  jsonOk,
  parseBody,
} from "@/lib/api/http";
import { createClient } from "@/lib/supabase/server";
import { updateCaseSchema } from "@/lib/validation/cases";
import { deleteCase, getCase, updateCase } from "@/modules/cases/repository";

// "Not found" is returned both for missing cases and other users' cases,
// so the API never reveals whether someone else's case exists.
const NOT_FOUND = "Case not found.";

/** GET /api/cases/[id] */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/cases/[id]">) {
  const user = await authenticate();
  if (user instanceof Response) return user;
  try {
    const { id } = await ctx.params;
    const found = await getCase(await createClient(), id);
    return found ? jsonOk({ case: found }) : jsonError(404, NOT_FOUND);
  } catch (e) {
    return handleRouteError(e);
  }
}

/** PATCH /api/cases/[id] — body: any of { case_title, state, lender_type, problem_description, closed } */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/cases/[id]">) {
  const blocked = checkMutationRequest(request);
  if (blocked) return blocked;
  const user = await authenticate();
  if (user instanceof Response) return user;

  const body = await parseBody(request, updateCaseSchema);
  if ("response" in body) return body.response;
  try {
    const { id } = await ctx.params;
    const updated = await updateCase(await createClient(), id, body.data);
    return updated ? jsonOk({ case: updated }) : jsonError(404, NOT_FOUND);
  } catch (e) {
    return handleRouteError(e);
  }
}

/** DELETE /api/cases/[id] — permanently deletes the case and its files. */
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/cases/[id]">) {
  const blocked = checkMutationRequest(request);
  if (blocked) return blocked;
  const user = await authenticate();
  if (user instanceof Response) return user;
  try {
    const { id } = await ctx.params;
    const deleted = await deleteCase(await createClient(), id);
    return deleted ? jsonOk({ deleted: true }) : jsonError(404, NOT_FOUND);
  } catch (e) {
    return handleRouteError(e);
  }
}
