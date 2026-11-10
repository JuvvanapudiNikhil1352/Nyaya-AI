import type { NextRequest } from "next/server";
import { authenticate, checkUploadRequest, handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { createClient } from "@/lib/supabase/server";
import { getCase } from "@/modules/cases/repository";
import { MAX_UPLOAD_BYTES } from "@/modules/documents/file-checks";
import { DocumentError, listDocuments, uploadDocument } from "@/modules/documents/repository";

/** GET /api/cases/[id]/documents — the case's documents (no file contents). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/cases/[id]/documents">) {
  const user = await authenticate();
  if (user instanceof Response) return user;
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const c = await getCase(supabase, id);
    if (!c) return jsonError(404, "Case not found.");
    return jsonOk({ documents: await listDocuments(supabase, c.id) });
  } catch (e) {
    return handleRouteError(e);
  }
}

/**
 * POST /api/cases/[id]/documents — upload one file (form field "file").
 * The file is stored privately; reading it with AI is a separate request
 * (POST …/documents/[documentId]/read) so a busy AI never loses an upload.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/cases/[id]/documents">) {
  // Multipart adds a little overhead around the file itself.
  const blocked = checkUploadRequest(request, MAX_UPLOAD_BYTES + 64 * 1024);
  if (blocked) return blocked;
  const user = await authenticate();
  if (user instanceof Response) return user;

  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const c = await getCase(supabase, id);
    if (!c) return jsonError(404, "Case not found.");
    if (c.case_status === "closed") return jsonError(409, "This case is closed. Reopen it to add documents.");

    let file: FormDataEntryValue | null;
    try {
      file = (await request.formData()).get("file");
    } catch {
      return jsonError(400, "The upload could not be read. Please try again.");
    }
    if (!(file instanceof File)) return jsonError(400, "Choose a file to upload.");
    if (file.size > MAX_UPLOAD_BYTES) return jsonError(413, "The file is larger than 10 MB.");

    const document = await uploadDocument(supabase, c, { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name });
    return jsonOk({ document }, 201);
  } catch (e) {
    if (e instanceof DocumentError) return jsonError(e.status, e.message);
    return handleRouteError(e);
  }
}
