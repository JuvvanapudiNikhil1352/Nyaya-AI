import { FACT_FIELDS, valuesEqual, type FactField, type FactValue } from "./fields";

/**
 * Pure merge rules. Kept separate from the database so they can be unit-tested.
 */

export type FactStatus = "unverified" | "confirmed" | "corrected" | "disputed" | "missing";

export type CurrentFact = {
  field: FactField;
  value: FactValue | null;
  approximate: boolean;
  status: FactStatus;
  sourceType: "user_statement" | "uploaded_document" | "user_confirmed";
  quote: string | null;
  confidence: number | null;
  /** The value the borrower confirmed earlier, when the current one disputes it. */
  previousConfirmed: FactValue | null;
  createdAt: string;
};

export type Incoming = { kind: "value"; value: FactValue } | { kind: "unknown" };

/**
 * What to do with a newly extracted fact, given the current one:
 * - "skip": nothing new (same value, or would overwrite a confirmed value with "unknown")
 * - insert with a status: "unverified" normally, "disputed" if it contradicts
 *   something the borrower confirmed, "missing" if they said they don't know.
 * A confirmed value is NEVER silently replaced.
 */
export function decideFact(current: Pick<CurrentFact, "value" | "status"> | null, incoming: Incoming): "skip" | FactStatus {
  const confirmed = current && (current.status === "confirmed" || current.status === "corrected");

  if (incoming.kind === "unknown") {
    if (!current) return "missing";
    if (current.status === "missing" || confirmed) return "skip";
    return current.value === null ? "skip" : "missing";
  }

  if (!current || current.status === "missing" || current.value === null) return "unverified";
  if (valuesEqual(current.value, incoming.value)) return "skip";
  return confirmed ? "disputed" : "unverified";
}

type Row = {
  field_name: string;
  extracted_value: { value?: FactValue | null; approximate?: boolean; quote?: string } | null;
  verification_status: FactStatus;
  source_type: CurrentFact["sourceType"];
  confidence: number | string | null;
  created_at: string;
};

/** Reduces the fact history (any order) to the current fact per field. */
export function currentFacts(rows: Row[]): Partial<Record<FactField, CurrentFact>> {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const out: Partial<Record<FactField, CurrentFact>> = {};
  const lastConfirmed: Partial<Record<FactField, FactValue | null>> = {};

  for (const r of sorted) {
    const field = r.field_name as FactField;
    if (!FACT_FIELDS.some((f) => f.key === field)) continue;
    const value = r.extracted_value?.value ?? null;
    out[field] = {
      field,
      value,
      approximate: r.extracted_value?.approximate === true,
      status: r.verification_status,
      sourceType: r.source_type,
      quote: r.extracted_value?.quote ?? null,
      confidence: r.confidence === null ? null : Number(r.confidence),
      previousConfirmed: r.verification_status === "disputed" ? (lastConfirmed[field] ?? null) : null,
      createdAt: r.created_at,
    };
    if (r.verification_status === "confirmed" || r.verification_status === "corrected") lastConfirmed[field] = value;
  }
  return out;
}

export type RepaymentKey = { amount: number; date: string | null };

/** True if a repayment with the same amount and date is already recorded. */
export function isDuplicateRepayment(existing: RepaymentKey[], incoming: RepaymentKey): boolean {
  return existing.some((e) => Math.abs(Number(e.amount) - incoming.amount) < 0.005 && (e.date ?? null) === (incoming.date ?? null));
}

export type ChargeKey = { amount: number | null; date: string | null; charge_type: string };

export function isDuplicateCharge(existing: ChargeKey[], incoming: ChargeKey): boolean {
  return existing.some(
    (e) =>
      (e.amount === null ? null : Number(e.amount)) === incoming.amount &&
      (e.date ?? null) === (incoming.date ?? null) &&
      e.charge_type === incoming.charge_type,
  );
}

export type MissingItem = { key: string; label: string; required: boolean };

/**
 * What is still missing. "required" items are needed for a calculation; the
 * borrower can still confirm without them — the analysis will state the gaps.
 */
export function missingInformation(
  facts: Partial<Record<FactField, CurrentFact>>,
  repaymentCount: number,
): MissingItem[] {
  const has = (f: FactField) => {
    const c = facts[f];
    return !!c && c.value !== null && c.status !== "missing";
  };
  const missing: MissingItem[] = [];
  for (const def of FACT_FIELDS) {
    if (def.key === "documents_mentioned" || def.key === "total_repaid_reported" || def.key === "amount_actually_received") continue;
    if (def.key === "compounding_frequency" && facts.interest_type?.value !== "compound") continue;
    if (!has(def.key)) {
      missing.push({ key: def.key, label: def.label, required: Boolean("requiredForCalculation" in def && def.requiredForCalculation) || def.key === "compounding_frequency" });
    }
  }
  if (repaymentCount === 0 && !has("total_repaid_reported")) {
    missing.push({ key: "repayments", label: "Repayments made (dates and amounts)", required: true });
  } else if (repaymentCount === 0) {
    missing.push({ key: "repayments", label: "Individual repayment dates and amounts", required: false });
  }
  return missing;
}
