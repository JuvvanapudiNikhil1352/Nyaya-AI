import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, handleRouteError, jsonError } from "@/lib/api/http";
import { createClient } from "@/lib/supabase/server";
import { getCase } from "@/modules/cases/repository";
import { signedFileUrl } from "@/modules/documents/repository";

/**
 * GET /api/cases/[id]/documents/[documentId]/file — opens the original file
 * through a private link that expires after 60 seconds.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/cases/[id]/documents/[documentId]/file">) {
  const user = await authenticate();
  if (user instanceof Response) return user;
  try {
    const { id, documentId } = await ctx.params;
    if (!z.uuid().safeParse(documentId).success) return jsonError(404, "Document not found.");
    const supabase = await createClient();
    const c = await getCase(supabase, id);
    if (!c) return jsonError(404, "Case not found.");
    const url = await signedFileUrl(supabase, c, documentId);
    if (!url) return jsonError(404, "Document not found.");
    const res = NextResponse.redirect(url, 303);
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  } catch (e) {
    return handleRouteError(e);
  }
}
