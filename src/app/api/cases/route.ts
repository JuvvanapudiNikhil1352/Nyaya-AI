import type { NextRequest } from "next/server";
import { authenticate, checkMutationRequest, handleRouteError, jsonOk, parseBody } from "@/lib/api/http";
import { createClient } from "@/lib/supabase/server";
import { createCaseSchema } from "@/lib/validation/cases";
import { createCase, listCases } from "@/modules/cases/repository";

/** GET /api/cases?include_closed=true — the logged-in user's cases. */
export async function GET(request: NextRequest) {
  const user = await authenticate();
  if (user instanceof Response) return user;
  try {
    const includeClosed = request.nextUrl.searchParams.get("include_closed") === "true";
    const cases = await listCases(await createClient(), { includeClosed });
    return jsonOk({ cases });
  } catch (e) {
    return handleRouteError(e);
  }
}

/** POST /api/cases — create a case. Body: { case_title?, state, lender_type, problem_description? } */
export async function POST(request: NextRequest) {
  const blocked = checkMutationRequest(request);
  if (blocked) return blocked;
  const user = await authenticate();
  if (user instanceof Response) return user;

  const body = await parseBody(request, createCaseSchema);
  if ("response" in body) return body.response;
  try {
    const created = await createCase(await createClient(), body.data);
    return jsonOk({ case: created }, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
