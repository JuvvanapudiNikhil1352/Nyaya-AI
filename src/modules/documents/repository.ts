import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson, getDocumentChain, AIConfigError } from "@/lib/ai/llm";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import type { CaseRecord } from "@/types/case";
import { CHARGE_TYPES, FIELD_BY_KEY, formatFactValue, formatINR, formatISODate, isFactField, labelOf } from "@/modules/extraction/fields";
import { applyExtraction, removeUnverifiedDocumentFacts } from "@/modules/facts/repository";
import { aiDocumentReadingSchema, buildDocumentReadingPrompt, DOCUMENT_READING_JSON_SCHEMA, normaliseDocumentReading } from "./ai-reading";
import { buildChecklist, type EvidenceKey, type EvidenceMark } from "./evidence";
import { checkUpload, MAX_DOCUMENTS_PER_CASE, sanitizeFilename } from "./file-checks";

/** All calls run as the logged-in user: RLS limits them to the user's own cases and files. */

const BUCKET = "case-documents";
/** A read that started this long ago is treated as abandoned and may be retried. */
const STALE_PROCESSING_MS = 3 * 60_000;

export type DocumentRow = {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  document_type: string;
  extraction_status: "pending" | "processing" | "completed" | "needs_review" | "failed";
  extraction_notes: string | null;
  summary: string | null;
  is_handwritten: boolean | null;
  legibility: string | null;
  evidence_covers: string[];
  read_at: string | null;
  created_at: string;
  updated_at: string;
};

const DOCUMENT_COLUMNS =
  "id, original_filename, mime_type, size_bytes, document_type, extraction_status, extraction_notes, summary, is_handwritten, legibility, evidence_covers, read_at, created_at, updated_at";

/** A problem the user can fix or should be told about (safe message, HTTP status). */
export class DocumentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DocumentError";
  }
}

export async function listDocuments(supabase: SupabaseClient, caseId: string): Promise<DocumentRow[]> {
  const { data, error } = await supabase
    .from("documents")
    .select(DOCUMENT_COLUMNS)
    .eq("case_id", caseId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw dbError("listDocuments", error);
  return (data ?? []) as DocumentRow[];
}

export async function getDocument(supabase: SupabaseClient, caseId: string, id: string) {
  const { data, error } = await supabase
    .from("documents")
    .select(`${DOCUMENT_COLUMNS}, storage_path`)
    .eq("case_id", caseId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw dbError("getDocument", error);
  return data as (DocumentRow & { storage_path: string }) | null;
}

/** Checklist for the Documents page and the chat assistant. */
export async function loadEvidence(supabase: SupabaseClient, caseId: string) {
  const [documents, marks] = await Promise.all([
    listDocuments(supabase, caseId),
    supabase.from("evidence_items").select("evidence_type, status").eq("case_id", caseId),
  ]);
  if (marks.error) throw dbError("loadEvidence", marks.error);
  return { documents, checklist: buildChecklist(documents, marks.data ?? []) };
}

/**
 * Stores an uploaded file privately at {user}/{case}/{random}.{ext} and records it.
 * The type is checked from the file's contents. The file is not read by AI yet.
 */
export async function uploadDocument(supabase: SupabaseClient, c: CaseRecord, file: { bytes: Uint8Array; name: string }): Promise<DocumentRow> {
  const check = checkUpload(file.bytes);
  if (!check.ok) throw new DocumentError(check.error, 415);
  await enforceRateLimit(supabase, "document:upload");

  const { count, error: countError } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("case_id", c.id);
  if (countError) throw dbError("countDocuments", countError);
  if ((count ?? 0) >= MAX_DOCUMENTS_PER_CASE) {
    throw new DocumentError(`A case can have up to ${MAX_DOCUMENTS_PER_CASE} documents. Delete one to add another.`, 409);
  }

  const path = `${c.user_id}/${c.id}/${randomUUID()}.${check.extension}`;
  const stored = await supabase.storage.from(BUCKET).upload(path, file.bytes, { contentType: check.mimeType, upsert: false });
  if (stored.error) {
    console.error("[documents] storage upload failed", { message: stored.error.message });
    throw new Error("Could not store the file. Please try again.");
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      case_id: c.id,
      original_filename: sanitizeFilename(file.name),
      storage_path: path,
      mime_type: check.mimeType,
      size_bytes: file.bytes.length,
    })
    .select(DOCUMENT_COLUMNS)
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]); // don't leave an orphan file
    throw dbError("insertDocument", error);
  }
  return data as DocumentRow;
}

/**
 * Reads a document with AI and adds what it finds to the case as UNVERIFIED facts.
 * Only one read runs at a time per document. Throws AIUnavailableError when
 * the free AI quota is busy (the document is marked "failed" and can be retried).
 */
export async function readDocument(supabase: SupabaseClient, c: CaseRecord, documentId: string) {
  const doc = await getDocument(supabase, c.id, documentId);
  if (!doc) throw new DocumentError("Document not found.", 404);
  if (doc.extraction_status === "completed" || doc.extraction_status === "needs_review") {
    throw new DocumentError("This document has already been read.", 409);
  }
  if (getDocumentChain().length === 0) throw new AIConfigError("Document reading needs GEMINI_API_KEY.");

  await enforceRateLimit(supabase, "document:read");
  await enforceRateLimit(supabase, "document:read_daily");

  // Claim the document so two requests can't read it at the same time.
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const claim = await supabase
    .from("documents")
    .update({ extraction_status: "processing", extraction_notes: null })
    .eq("id", doc.id)
    .eq("case_id", c.id)
    .or(`extraction_status.in.(pending,failed),and(extraction_status.eq.processing,updated_at.lt.${staleBefore})`)
    .select("id");
  if (claim.error) throw dbError("claimDocument", claim.error);
  if (!claim.data?.length) throw new DocumentError("This document is already being read.", 409);

  try {
    const file = await supabase.storage.from(BUCKET).download(doc.storage_path);
    if (file.error || !file.data) throw new Error(`download failed: ${file.error?.message ?? "no data"}`);
    const base64 = Buffer.from(await file.data.arrayBuffer()).toString("base64");

    const result = await generateJson({
      system: buildDocumentReadingPrompt(),
      messages: [{ role: "user", content: "Read the attached document." }],
      files: [{ mimeType: doc.mime_type, base64 }],
      chain: getDocumentChain(),
      jsonSchema: DOCUMENT_READING_JSON_SCHEMA,
      schemaName: "document_reading",
      validate: aiDocumentReadingSchema,
      temperature: 0,
      maxOutputTokens: 8192,
      timeoutMs: 80_000,
      attemptTimeoutMs: 55_000,
    });
    const reading = normaliseDocumentReading(result.data);

    const { data, error } = await supabase
      .from("documents")
      .update({
        document_type: reading.documentType,
        extraction_status: reading.status,
        extraction_notes: reading.notes.join(" ").slice(0, 2000) || null,
        extracted_text: reading.transcript || null,
        summary: reading.summary || null,
        is_handwritten: reading.handwritten,
        legibility: reading.legibility,
        evidence_covers: reading.evidenceCovers,
        read_by: result.model,
        read_at: new Date().toISOString(),
      })
      .eq("id", doc.id)
      .select(DOCUMENT_COLUMNS)
      .single();
    if (error) throw dbError("saveReading", error);

    let factsAdded = 0;
    try {
      factsAdded = await applyExtraction(supabase, c, { documentId: doc.id }, reading.extraction);
    } catch (e) {
      // The reading is saved; facts can be added by hand on the summary page.
      console.error("[documents] could not save extracted facts", e instanceof Error ? e.message : "unknown");
    }
    return { document: data as DocumentRow, factsAdded };
  } catch (e) {
    await supabase
      .from("documents")
      .update({ extraction_status: "failed", extraction_notes: "We couldn't read this document. You can try again." })
      .eq("id", doc.id);
    throw e;
  }
}

/** Deletes the file and its record, plus any details from it the borrower hasn't checked. */
export async function deleteDocument(supabase: SupabaseClient, c: CaseRecord, documentId: string) {
  await enforceRateLimit(supabase, "document:update");
  const doc = await getDocument(supabase, c.id, documentId);
  if (!doc) throw new DocumentError("Document not found.", 404);

  await removeUnverifiedDocumentFacts(supabase, c, doc.id);
  const removed = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  if (removed.error) {
    console.error("[documents] storage delete failed", { message: removed.error.message });
    throw new Error("Could not delete the file. Please try again.");
  }
  const { error } = await supabase.from("documents").delete().eq("id", doc.id).eq("case_id", c.id);
  if (error) throw dbError("deleteDocument", error);
}

/** The borrower corrects what kind of document this is. */
export async function setDocumentType(supabase: SupabaseClient, c: CaseRecord, documentId: string, documentType: string) {
  await enforceRateLimit(supabase, "document:update");
  const { data, error } = await supabase
    .from("documents")
    .update({ document_type: documentType })
    .eq("id", documentId)
    .eq("case_id", c.id)
    .select("id");
  if (error) throw dbError("setDocumentType", error);
  if (!data?.length) throw new DocumentError("Document not found.", 404);
}

/** The borrower says whether they have a kind of evidence. `null` clears their answer. */
export async function setEvidenceMark(supabase: SupabaseClient, c: CaseRecord, key: EvidenceKey, mark: EvidenceMark | null) {
  await enforceRateLimit(supabase, "document:update");
  const res =
    mark === null
      ? await supabase.from("evidence_items").delete().eq("case_id", c.id).eq("evidence_type", key)
      : await supabase.from("evidence_items").upsert({ case_id: c.id, evidence_type: key, status: mark }, { onConflict: "case_id,evidence_type" });
  if (res.error) throw dbError("setEvidenceMark", res.error);
}

export type DocumentFinding = { label: string; value: string; quote: string | null; status: string };

/** What was taken from each document, grouped by document id, for display. */
export async function loadDocumentFindings(supabase: SupabaseClient, caseId: string): Promise<Record<string, DocumentFinding[]>> {
  const [f, r, ch] = await Promise.all([
    supabase
      .from("extracted_facts")
      .select("field_name, extracted_value, verification_status, source_document_id")
      .eq("case_id", caseId)
      .not("source_document_id", "is", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("repayments")
      .select("amount, repayment_date, date_is_approximate, source_type, source_quote, confirmation_status, evidence_document_id")
      .eq("case_id", caseId)
      .not("evidence_document_id", "is", null)
      .order("repayment_date", { ascending: true }),
    supabase
      .from("charges")
      .select("amount, charge_type, source_quote, confirmation_status, evidence_document_id")
      .eq("case_id", caseId)
      .not("evidence_document_id", "is", null),
  ]);
  for (const res of [f, r, ch]) if (res.error) throw dbError("loadDocumentFindings", res.error);

  const out: Record<string, DocumentFinding[]> = {};
  const add = (docId: string, item: DocumentFinding) => (out[docId] ??= []).push(item);
  for (const row of f.data ?? []) {
    if (!isFactField(row.field_name)) continue;
    const v = row.extracted_value?.value ?? null;
    if (v === null) continue;
    add(row.source_document_id, {
      label: FIELD_BY_KEY[row.field_name].label,
      value: formatFactValue(row.field_name, v, row.extracted_value?.approximate === true),
      quote: row.extracted_value?.quote ?? null,
      status: row.verification_status,
    });
  }
  for (const row of r.data ?? []) {
    const when = row.repayment_date ? ` on ${formatISODate(row.repayment_date, row.date_is_approximate)}` : "";
    add(row.evidence_document_id, {
      // A repayment already mentioned in chat, for which this document is proof.
      label: row.source_type === "uploaded_document" ? "Repayment" : "Proof of a repayment you mentioned",
      value: `${formatINR(Number(row.amount))}${when}`,
      quote: row.source_type === "uploaded_document" ? row.source_quote : null,
      status: row.confirmation_status,
    });
  }
  for (const row of ch.data ?? []) {
    add(row.evidence_document_id, {
      label: `Charge: ${labelOf(CHARGE_TYPES, row.charge_type).toLowerCase()}`,
      value: row.amount === null ? "amount not stated" : formatINR(Number(row.amount)),
      quote: row.source_quote,
      status: row.confirmation_status,
    });
  }
  return out;
}

/** A short-lived private link to view the original file. */
export async function signedFileUrl(supabase: SupabaseClient, c: CaseRecord, documentId: string): Promise<string | null> {
  const doc = await getDocument(supabase, c.id, documentId);
  if (!doc) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 60);
  if (error || !data) {
    console.error("[documents] signed URL failed", { message: error?.message });
    return null;
  }
  return data.signedUrl;
}

function dbError(where: string, error: { code?: string }) {
  console.error(`[documents] ${where} failed`, { code: error.code });
  return new Error("A database error occurred. Please try again.");
}
