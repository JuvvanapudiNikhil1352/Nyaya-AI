"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { RateLimitError } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getCase } from "@/modules/cases/repository";
import { isDocumentType, isEvidenceKey, isEvidenceMark } from "@/modules/documents/evidence";
import { deleteDocument, DocumentError, setDocumentType, setEvidenceMark } from "@/modules/documents/repository";

export type DocumentActionResult = { error?: string };

async function ownedCase(caseId: string) {
  await requireUser();
  const supabase = await createClient();
  const c = await getCase(supabase, caseId);
  if (!c) throw new DocumentError("Case not found.", 404);
  if (c.case_status === "closed") throw new DocumentError("This case is closed. Reopen it to make changes.", 409);
  return { supabase, c };
}

async function run(caseId: string, fn: () => Promise<DocumentActionResult | void>): Promise<DocumentActionResult> {
  try {
    const out = (await fn()) ?? {};
    revalidatePath(`/cases/${caseId}`, "layout");
    return out;
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof DocumentError) return { error: e.message };
    console.error("[documents] action failed", e instanceof Error ? e.message : "unknown");
    return { error: "Something went wrong. Please try again." };
  }
}

const isUuid = (v: string) => z.uuid().safeParse(v).success;

export async function deleteDocumentAction(caseId: string, documentId: string) {
  return run(caseId, async () => {
    if (!isUuid(documentId)) return { error: "Document not found." };
    const { supabase, c } = await ownedCase(caseId);
    await deleteDocument(supabase, c, documentId);
  });
}

export async function setDocumentTypeAction(caseId: string, documentId: string, documentType: string) {
  return run(caseId, async () => {
    if (!isUuid(documentId)) return { error: "Document not found." };
    if (!isDocumentType(documentType)) return { error: "Choose a document type." };
    const { supabase, c } = await ownedCase(caseId);
    await setDocumentType(supabase, c, documentId, documentType);
  });
}

/** `mark` = "partial" | "missing" | "not_applicable", or "" to clear. */
export async function setEvidenceMarkAction(caseId: string, key: string, mark: string) {
  return run(caseId, async () => {
    if (!isEvidenceKey(key)) return { error: "Unknown checklist item." };
    if (mark !== "" && !isEvidenceMark(mark)) return { error: "Choose an option." };
    const { supabase, c } = await ownedCase(caseId);
    await setEvidenceMark(supabase, c, key, mark === "" ? null : mark);
  });
}
