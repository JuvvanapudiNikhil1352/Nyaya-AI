import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { todayInIndia } from "@/lib/today";
import type { CaseRecord } from "@/types/case";
import { CHARGE_TYPES, labelOf } from "@/modules/extraction/fields";
import { loadCaseFacts } from "@/modules/facts/repository";
import { analyseLoan, ENGINE_VERSION, type AnalysisResult, type EngineInput } from "./engine";

/** All calls run as the logged-in user (RLS). */

export class AnalysisError extends Error {}

const CONFIRMED_STATUSES = ["confirmed", "analysed", "resolution_selected"];
const CONFIRMED_ITEM = ["confirmed", "corrected"];

export { todayInIndia };

/** Builds the engine input from the CONFIRMED loan record, repayments and charges only. */
export async function buildEngineInput(supabase: SupabaseClient, caseId: string, today = todayInIndia()): Promise<EngineInput> {
  const [loan, reps, chs, facts] = await Promise.all([
    supabase.from("loan_details").select("*").eq("case_id", caseId).maybeSingle(),
    supabase.from("repayments").select("repayment_date, amount, confirmation_status").eq("case_id", caseId).in("confirmation_status", CONFIRMED_ITEM),
    supabase.from("charges").select("charge_date, amount, charge_type, description, has_written_basis").eq("case_id", caseId).in("confirmation_status", CONFIRMED_ITEM),
    loadCaseFacts(supabase, caseId),
  ]);
  for (const res of [loan, reps, chs]) if (res.error) throw dbError("buildEngineInput", res.error);
  const l = loan.data;
  if (!l) throw new AnalysisError("Please confirm your case summary first.");

  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const reported = facts.facts.total_repaid_reported;
  return {
    principal: num(l.principal_amount),
    borrowingDate: l.borrowing_date,
    interestRate: num(l.interest_rate),
    ratePeriod: l.rate_period,
    interestType: l.interest_type,
    interestMethod: l.interest_method,
    compoundingFrequency: l.compounding_frequency,
    dayCount: l.day_count_convention,
    allocation: l.repayment_allocation,
    tenureMonths: num(l.tenure_months),
    amountActuallyReceived: num(l.amount_actually_received),
    lenderDemand: num(l.lender_demand),
    lenderDemandDate: l.lender_demand_date,
    totalRepaidReported:
      reported && reported.value !== null && CONFIRMED_ITEM.includes(reported.status) ? Number(reported.value) : null,
    repayments: (reps.data ?? []).map((r) => ({ date: r.repayment_date, amount: Number(r.amount) })),
    charges: (chs.data ?? []).map((c) => ({
      date: c.charge_date,
      amount: num(c.amount),
      label: c.description || labelOf(CHARGE_TYPES, c.charge_type),
      hasWrittenBasis: c.has_written_basis,
    })),
    today,
  };
}

/** Runs the engine on the confirmed facts and saves the result. */
export async function runAnalysis(supabase: SupabaseClient, c: CaseRecord): Promise<AnalysisResult> {
  if (!CONFIRMED_STATUSES.includes(c.case_status)) {
    throw new AnalysisError("Please confirm your case summary first. Only details you confirmed are used.");
  }
  await enforceRateLimit(supabase, "analysis:run");
  const input = await buildEngineInput(supabase, c.id);
  const result = analyseLoan(input);
  const primary = result.scenarios.find((s) => s.key === result.primaryKey) ?? null;

  const { error } = await supabase.from("financial_analyses").insert({
    case_id: c.id,
    input_snapshot: input,
    calculation_method: primary ? primary.key : result.status,
    calculated_balance: primary?.balance ?? null,
    total_interest: primary?.totalInterest ?? null,
    total_repayments: result.totalRepaid,
    lender_demand: result.lenderDemand,
    discrepancy: primary?.discrepancy ?? null,
    assumptions: result.assumptions,
    missing_information: result.missing,
    breakdown: result,
    engine_version: ENGINE_VERSION,
  });
  if (error) throw dbError("saveAnalysis", error);

  if (c.case_status === "confirmed" && result.status !== "insufficient") {
    const st = await supabase.from("cases").update({ case_status: "analysed" }).eq("id", c.id);
    if (st.error) console.error("[financial] status update failed", { code: st.error.code });
  }
  return result;
}

export type SavedAnalysis = { result: AnalysisResult; createdAt: string };

export async function loadLatestAnalysis(supabase: SupabaseClient, caseId: string): Promise<SavedAnalysis | null> {
  const { data, error } = await supabase
    .from("financial_analyses")
    .select("breakdown, created_at")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("loadLatestAnalysis", error);
  if (!data || !data.breakdown || Array.isArray(data.breakdown)) return null;
  return { result: data.breakdown as AnalysisResult, createdAt: data.created_at };
}

function dbError(where: string, error: { code?: string }) {
  console.error(`[financial] ${where} failed`, { code: error.code });
  return new Error("A database error occurred. Please try again.");
}
