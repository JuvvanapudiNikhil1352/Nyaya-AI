import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import type { CaseRecord } from "@/types/case";
import type { ExtractedCharge, ExtractedFact, ExtractedRepayment } from "@/modules/extraction/ai-extraction";
import { FIELD_BY_KEY, type FactField, type FactValue } from "@/modules/extraction/fields";
import {
  currentFacts,
  decideFact,
  isDuplicateCharge,
  isDuplicateRepayment,
  missingInformation,
  type CurrentFact,
} from "@/modules/extraction/merge";

/** All calls run as the logged-in user: RLS restricts them to the user's own cases. */

export type RepaymentRow = {
  id: string;
  repayment_date: string | null;
  date_is_approximate: boolean;
  amount: number;
  payment_method: string;
  description: string | null;
  source_type: string;
  source_quote: string | null;
  evidence_document_id: string | null;
  confirmation_status: string;
};

export type ChargeRow = {
  id: string;
  charge_date: string | null;
  amount: number | null;
  charge_type: string;
  description: string | null;
  has_written_basis: string;
  source_type: string;
  source_quote: string | null;
  confirmation_status: string;
};

export type CaseFacts = {
  facts: Partial<Record<FactField, CurrentFact>>;
  repayments: RepaymentRow[];
  charges: ChargeRow[];
  missing: ReturnType<typeof missingInformation>;
  hasDisputes: boolean;
  unverifiedCount: number;
};

export async function loadCaseFacts(supabase: SupabaseClient, caseId: string): Promise<CaseFacts> {
  const [f, r, c] = await Promise.all([
    supabase
      .from("extracted_facts")
      .select("field_name, extracted_value, verification_status, source_type, confidence, created_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true })
      .limit(2000),
    supabase
      .from("repayments")
      .select("id, repayment_date, date_is_approximate, amount, payment_method, description, source_type, source_quote, evidence_document_id, confirmation_status")
      .eq("case_id", caseId)
      .order("repayment_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("charges")
      .select("id, charge_date, amount, charge_type, description, has_written_basis, source_type, source_quote, confirmation_status")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
  ]);
  for (const res of [f, r, c]) if (res.error) throw dbError("loadCaseFacts", res.error);

  const facts = currentFacts(f.data ?? []);
  const repayments = ((r.data ?? []) as RepaymentRow[]).map((x) => ({ ...x, amount: Number(x.amount) }));
  const charges = ((c.data ?? []) as ChargeRow[]).map((x) => ({ ...x, amount: x.amount === null ? null : Number(x.amount) }));
  const all = Object.values(facts);
  return {
    facts,
    repayments,
    charges,
    missing: missingInformation(facts, repayments.length),
    hasDisputes: all.some((x) => x?.status === "disputed"),
    unverifiedCount:
      all.filter((x) => x?.status === "unverified").length +
      repayments.filter((x) => x.confirmation_status === "unverified").length +
      charges.filter((x) => x.confirmation_status === "unverified").length,
  };
}

/**
 * Applies facts extracted from one chat message (pass its id) or one uploaded
 * document (pass `{ documentId }`). Everything is stored as unverified.
 * Returns how many records changed.
 */
export async function applyExtraction(
  supabase: SupabaseClient,
  c: CaseRecord,
  source: string | { documentId: string },
  extraction: { facts: ExtractedFact[]; repayments: ExtractedRepayment[]; charges: ExtractedCharge[] },
): Promise<number> {
  const current = await loadCaseFacts(supabase, c.id);
  let changes = 0;
  const fromDocument = typeof source !== "string";
  const sourceType = fromDocument ? "uploaded_document" : "user_statement";
  const messageId = fromDocument ? null : source;
  const documentId = fromDocument ? source.documentId : null;
  // Facts link the document through source_document_id; repayments and charges through evidence_document_id.
  const factSource = fromDocument ? { source_document_id: documentId } : { source_message_id: messageId };
  const itemSource = fromDocument ? { evidence_document_id: documentId } : { source_message_id: messageId };

  const factRows = [];
  for (const fact of extraction.facts) {
    const decision = decideFact(
      current.facts[fact.field] ?? null,
      fact.kind === "unknown" ? { kind: "unknown" } : { kind: "value", value: fact.value },
    );
    if (decision === "skip") continue;
    factRows.push({
      case_id: c.id,
      field_name: fact.field,
      extracted_value:
        fact.kind === "unknown"
          ? { value: null, quote: fact.quote }
          : { value: fact.value, approximate: fact.approximate, quote: fact.quote },
      source_type: sourceType,
      ...factSource,
      confidence: fact.kind === "unknown" ? null : fact.confidence,
      verification_status: decision,
    });
  }
  if (factRows.length) {
    const { error } = await supabase.from("extracted_facts").insert(factRows);
    if (error) throw dbError("insertFacts", error);
    changes += factRows.length;
  }

  const known = current.repayments.map((r) => ({ amount: r.amount, date: r.repayment_date }));
  const repaymentRows = [];
  const proofLinks: string[] = [];
  for (const r of extraction.repayments) {
    if (isDuplicateRepayment(known, { amount: r.amount, date: r.date })) {
      // Already recorded (e.g. from chat): a document becomes its proof instead of a duplicate.
      const existing = fromDocument
        ? current.repayments.find((x) => !x.evidence_document_id && isDuplicateRepayment([{ amount: x.amount, date: x.repayment_date }], { amount: r.amount, date: r.date }))
        : undefined;
      if (existing && !proofLinks.includes(existing.id)) proofLinks.push(existing.id);
      continue;
    }
    known.push({ amount: r.amount, date: r.date });
    repaymentRows.push({
      case_id: c.id,
      amount: r.amount,
      repayment_date: r.date,
      date_is_approximate: r.approximate,
      payment_method: r.method,
      source_type: sourceType,
      ...itemSource,
      source_quote: r.quote,
    });
  }
  if (proofLinks.length) {
    // Linking proof does not change the amount or date, so no re-confirmation is needed.
    const { error } = await supabase.from("repayments").update({ evidence_document_id: documentId }).in("id", proofLinks).is("evidence_document_id", null);
    if (error) throw dbError("linkRepaymentProof", error);
  }
  if (repaymentRows.length) {
    const { error } = await supabase.from("repayments").insert(repaymentRows);
    if (error) throw dbError("insertRepayments", error);
    changes += repaymentRows.length;
  }

  const knownCharges = current.charges.map((x) => ({ amount: x.amount, date: x.charge_date, charge_type: x.charge_type }));
  const chargeRows = [];
  for (const ch of extraction.charges) {
    const key = { amount: ch.amount, date: ch.date, charge_type: ch.chargeType };
    if (isDuplicateCharge(knownCharges, key)) continue;
    knownCharges.push(key);
    chargeRows.push({
      case_id: c.id,
      amount: ch.amount,
      charge_date: ch.date,
      charge_type: ch.chargeType,
      has_written_basis: ch.hasWrittenBasis,
      description: ch.description || null,
      source_type: sourceType,
      ...itemSource,
      source_quote: ch.quote,
    });
  }
  if (chargeRows.length) {
    const { error } = await supabase.from("charges").insert(chargeRows);
    if (error) throw dbError("insertCharges", error);
    changes += chargeRows.length;
  }

  if (changes > 0) await onFactsChanged(supabase, c, { extractedCore: hasCoreFacts(current, extraction.facts) });
  return changes;
}

function hasCoreFacts(current: CaseFacts, incoming: ExtractedFact[]) {
  const known = (f: FactField) =>
    (current.facts[f]?.value ?? null) !== null || incoming.some((x) => x.field === f && x.kind === "value");
  return known("principal_amount") && known("lender_demand");
}

/**
 * Keeps the case status honest: once core facts exist the summary is ready
 * for confirmation; any change after confirmation requires re-confirmation.
 */
async function onFactsChanged(supabase: SupabaseClient, c: CaseRecord, opts: { extractedCore?: boolean } = {}) {
  let next: CaseRecord["case_status"] | null = null;
  if (c.case_status === "intake" && opts.extractedCore) next = "awaiting_confirmation";
  if (["confirmed", "analysed", "resolution_selected"].includes(c.case_status)) next = "awaiting_confirmation";
  if (!next) return;
  const { error } = await supabase.from("cases").update({ case_status: next, confirmed_at: null }).eq("id", c.id);
  if (error) console.error("[facts] status update failed", { code: error.code });
}

// ---------------------------------------------------------------- user actions

export async function confirmFact(supabase: SupabaseClient, c: CaseRecord, field: FactField) {
  await enforceRateLimit(supabase, "facts:update");
  const { data, error } = await supabase
    .from("extracted_facts")
    .select("id, verification_status, extracted_value")
    .eq("case_id", c.id)
    .eq("field_name", field)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("confirmFact", error);
  if (!data || data.extracted_value?.value == null) throw new Error("There is no value to confirm.");
  if (data.verification_status === "confirmed" || data.verification_status === "corrected") return;
  const upd = await supabase.from("extracted_facts").update({ verification_status: "confirmed" }).eq("id", data.id);
  if (upd.error) throw dbError("confirmFact", upd.error);
  await onFactsChanged(supabase, c);
}

/** The borrower typed a value: always stored as their own corrected fact. */
export async function setFactValue(
  supabase: SupabaseClient,
  c: CaseRecord,
  field: FactField,
  value: FactValue,
  approximate: boolean,
) {
  await enforceRateLimit(supabase, "facts:update");
  const { error } = await supabase.from("extracted_facts").insert({
    case_id: c.id,
    field_name: field,
    extracted_value: { value, approximate: FIELD_BY_KEY[field].kind === "date" ? approximate : false },
    source_type: "user_confirmed",
    confidence: 1,
    verification_status: "corrected",
  });
  if (error) throw dbError("setFactValue", error);
  await onFactsChanged(supabase, c);
}

export async function markFactUnknown(supabase: SupabaseClient, c: CaseRecord, field: FactField) {
  await enforceRateLimit(supabase, "facts:update");
  const { error } = await supabase.from("extracted_facts").insert({
    case_id: c.id,
    field_name: field,
    extracted_value: { value: null },
    source_type: "user_confirmed",
    confidence: null,
    verification_status: "missing",
  });
  if (error) throw dbError("markFactUnknown", error);
  await onFactsChanged(supabase, c);
}

export type RepaymentInput = { amount: number; repayment_date: string | null; date_is_approximate: boolean; payment_method: string; description: string | null };

export async function saveRepayment(supabase: SupabaseClient, c: CaseRecord, input: RepaymentInput, id?: string) {
  await enforceRateLimit(supabase, "facts:update");
  const row = { ...input, source_type: "user_confirmed", confirmation_status: id ? "corrected" : "confirmed" };
  const res = id
    ? await supabase.from("repayments").update(row).eq("id", id).eq("case_id", c.id).select("id")
    : await supabase.from("repayments").insert({ ...row, case_id: c.id }).select("id");
  if (res.error) throw dbError("saveRepayment", res.error);
  if (!res.data?.length) throw new Error("Repayment not found.");
  await onFactsChanged(supabase, c);
}

export type ChargeInput = { amount: number | null; charge_date: string | null; charge_type: string; has_written_basis: string; description: string | null };

export async function saveCharge(supabase: SupabaseClient, c: CaseRecord, input: ChargeInput, id?: string) {
  await enforceRateLimit(supabase, "facts:update");
  const row = { ...input, source_type: "user_confirmed", confirmation_status: id ? "corrected" : "confirmed" };
  const res = id
    ? await supabase.from("charges").update(row).eq("id", id).eq("case_id", c.id).select("id")
    : await supabase.from("charges").insert({ ...row, case_id: c.id }).select("id");
  if (res.error) throw dbError("saveCharge", res.error);
  if (!res.data?.length) throw new Error("Charge not found.");
  await onFactsChanged(supabase, c);
}

export async function setItemConfirmed(supabase: SupabaseClient, c: CaseRecord, table: "repayments" | "charges", id: string) {
  await enforceRateLimit(supabase, "facts:update");
  const res = await supabase
    .from(table)
    .update({ confirmation_status: "confirmed" })
    .eq("id", id)
    .eq("case_id", c.id)
    .eq("confirmation_status", "unverified")
    .select("id");
  if (res.error) throw dbError("setItemConfirmed", res.error);
  await onFactsChanged(supabase, c);
}

export async function deleteItem(supabase: SupabaseClient, c: CaseRecord, table: "repayments" | "charges", id: string) {
  await enforceRateLimit(supabase, "facts:update");
  const res = await supabase.from(table).delete().eq("id", id).eq("case_id", c.id).select("id");
  if (res.error) throw dbError("deleteItem", res.error);
  if (!res.data?.length) throw new Error("Item not found.");
  await onFactsChanged(supabase, c);
}

/**
 * Before a document is deleted: removes the details read from it that the
 * borrower has NOT checked yet. Confirmed or corrected details stay (the
 * borrower vouched for them). Returns how many records were removed.
 */
export async function removeUnverifiedDocumentFacts(supabase: SupabaseClient, c: CaseRecord, documentId: string): Promise<number> {
  const steps = await Promise.all([
    supabase.from("extracted_facts").delete().eq("case_id", c.id).eq("source_document_id", documentId).in("verification_status", ["unverified", "disputed"]).select("id"),
    supabase.from("repayments").delete().eq("case_id", c.id).eq("evidence_document_id", documentId).eq("source_type", "uploaded_document").eq("confirmation_status", "unverified").select("id"),
    supabase.from("charges").delete().eq("case_id", c.id).eq("evidence_document_id", documentId).eq("source_type", "uploaded_document").eq("confirmation_status", "unverified").select("id"),
  ]);
  let removed = 0;
  for (const s of steps) {
    if (s.error) throw dbError("removeDocumentFacts", s.error);
    removed += s.data?.length ?? 0;
  }
  if (removed > 0) await onFactsChanged(supabase, c);
  return removed;
}

// ---------------------------------------------------------------- confirmation

export class ConfirmationError extends Error {}

const LOAN_DETAIL_FIELDS = [
  "principal_amount", "amount_actually_received", "borrowing_date", "rate_period", "interest_rate",
  "interest_type", "interest_method", "compounding_frequency", "tenure_months", "repayment_frequency",
  "lender_demand", "lender_demand_date", "repayment_allocation",
] as const satisfies readonly FactField[];

const ENUM_DEFAULTS: Partial<Record<FactField, string>> = {
  rate_period: "unknown", interest_type: "unknown", interest_method: "unknown",
  compounding_frequency: "unknown", repayment_frequency: "unknown", repayment_allocation: "unknown",
};

/**
 * The borrower confirms the summary as correct. All shown facts become
 * "confirmed", the structured loan record is written for the calculator, and
 * the case moves to "confirmed". Missing information does NOT block this —
 * it is returned so the analysis can state its limitations.
 */
export async function confirmSummary(supabase: SupabaseClient, c: CaseRecord) {
  await enforceRateLimit(supabase, "facts:update");
  const data = await loadCaseFacts(supabase, c.id);
  if (data.hasDisputes) {
    throw new ConfirmationError("Some details conflict with what you confirmed earlier. Please resolve them first.");
  }
  const facts = data.facts;
  if (!facts.principal_amount || facts.principal_amount.value === null) {
    throw new ConfirmationError("Please add at least the amount you borrowed before confirming.");
  }

  // 1. Unverified -> confirmed
  const steps = await Promise.all([
    supabase.from("extracted_facts").update({ verification_status: "confirmed" }).eq("case_id", c.id).eq("verification_status", "unverified"),
    supabase.from("repayments").update({ confirmation_status: "confirmed" }).eq("case_id", c.id).eq("confirmation_status", "unverified"),
    supabase.from("charges").update({ confirmation_status: "confirmed" }).eq("case_id", c.id).eq("confirmation_status", "unverified"),
  ]);
  for (const s of steps) if (s.error) throw dbError("confirmSummary", s.error);

  // 2. Structured loan record used by the calculation engine
  const loan: Record<string, unknown> = { case_id: c.id, confirmation_status: "confirmed" };
  for (const f of LOAN_DETAIL_FIELDS) {
    const cur = facts[f];
    const value = cur && cur.status !== "missing" ? cur.value : null;
    loan[f] = value ?? ENUM_DEFAULTS[f] ?? null;
  }
  const up = await supabase.from("loan_details").upsert(loan, { onConflict: "case_id" });
  if (up.error) throw dbError("confirmSummary:loan_details", up.error);

  // 3. Case status
  const st = await supabase.from("cases").update({ case_status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", c.id);
  if (st.error) throw dbError("confirmSummary:case", st.error);

  return { missing: data.missing };
}

function dbError(where: string, error: { code?: string }) {
  console.error(`[facts] ${where} failed`, { code: error.code });
  return new Error("A database error occurred. Please try again.");
}
