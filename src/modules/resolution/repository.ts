import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import type { CaseRecord } from "@/types/case";
import { loadEvidence } from "@/modules/documents/repository";
import { loadLatestAnalysis } from "@/modules/financial/repository";
import { loadLatestLegal } from "@/modules/legal/repository";
import { buildActionPlan, recommend, type PlanContext, type PlanStep, type Recommendation, type ResolutionType } from "./plan";

export class ResolutionError extends Error {}

const CONFIRMED = ["confirmed", "analysed", "resolution_selected"];

export async function loadPlanContext(supabase: SupabaseClient, c: CaseRecord): Promise<PlanContext> {
  const [analysis, legal, evidence] = await Promise.all([loadLatestAnalysis(supabase, c.id), loadLatestLegal(supabase, c.id), loadEvidence(supabase, c.id)]);
  const r = analysis?.result;
  const primary = r?.scenarios.find((s) => s.key === r.primaryKey);
  return {
    safetyConcern: c.safety_concern,
    analysis: r
      ? {
          status: r.status,
          balance: primary?.balance ?? null,
          range: r.range,
          lenderDemand: r.lenderDemand,
          asOfDate: r.asOfDate,
          totalRepaid: r.totalRepaid,
          chargesReviewCount: r.chargesNeedingReview.length,
        }
      : null,
    legal: {
      exists: !!legal,
      lawyerRecommended: legal?.result.lawyer.recommended ?? false,
      notCoveredCount: legal?.result.notCovered.length ?? 0,
    },
    evidence: evidence.checklist.map((e) => ({ key: e.key, label: e.label, status: e.status })),
  };
}

export type ActionPlan = {
  id: string;
  resolutionType: ResolutionType;
  steps: PlanStep[];
  recommendation: Recommendation;
  choseRecommended: boolean;
  createdAt: string;
};

type Stored = { steps: PlanStep[]; recommendation: Recommendation; chose_recommended: boolean };

/** The borrower chooses a path. Earlier plans are archived, never deleted. */
export async function selectResolution(supabase: SupabaseClient, c: CaseRecord, type: ResolutionType): Promise<ActionPlan> {
  if (!CONFIRMED.includes(c.case_status)) throw new ResolutionError("Please confirm your case summary first.");
  await enforceRateLimit(supabase, "plan:update");
  const ctx = await loadPlanContext(supabase, c);
  const recommendation = recommend(ctx);
  const stored: Stored = { steps: buildActionPlan(type, ctx), recommendation, chose_recommended: recommendation.recommended === type };

  const archive = await supabase.from("action_plans").update({ status: "archived" }).eq("case_id", c.id).eq("status", "active");
  if (archive.error) throw dbError("archivePlans", archive.error);
  const { data, error } = await supabase
    .from("action_plans")
    .insert({ case_id: c.id, resolution_type: type, recommendations: stored, status: "active" })
    .select("id, created_at")
    .single();
  if (error) throw dbError("insertPlan", error);

  if (c.case_status !== "resolution_selected") {
    const st = await supabase.from("cases").update({ case_status: "resolution_selected" }).eq("id", c.id);
    if (st.error) console.error("[resolution] status update failed", { code: st.error.code });
  }
  return { id: data.id, resolutionType: type, steps: stored.steps, recommendation, choseRecommended: stored.chose_recommended, createdAt: data.created_at };
}

export async function loadActivePlan(supabase: SupabaseClient, caseId: string): Promise<ActionPlan | null> {
  const { data, error } = await supabase
    .from("action_plans")
    .select("id, resolution_type, recommendations, created_at")
    .eq("case_id", caseId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("loadActivePlan", error);
  if (!data) return null;
  const s = data.recommendations as Stored;
  return { id: data.id, resolutionType: data.resolution_type, steps: s.steps ?? [], recommendation: s.recommendation, choseRecommended: s.chose_recommended, createdAt: data.created_at };
}

export async function setStepDone(supabase: SupabaseClient, c: CaseRecord, planId: string, stepId: string, done: boolean) {
  await enforceRateLimit(supabase, "plan:update");
  const { data, error } = await supabase.from("action_plans").select("recommendations").eq("id", planId).eq("case_id", c.id).eq("status", "active").maybeSingle();
  if (error) throw dbError("loadPlan", error);
  if (!data) throw new ResolutionError("Action plan not found.");
  const s = data.recommendations as Stored;
  if (!s.steps.some((x) => x.id === stepId)) throw new ResolutionError("Step not found.");
  const steps = s.steps.map((x) => (x.id === stepId ? { ...x, done } : x));
  const upd = await supabase.from("action_plans").update({ recommendations: { ...s, steps } }).eq("id", planId).eq("case_id", c.id);
  if (upd.error) throw dbError("updatePlan", upd.error);
}

function dbError(where: string, error: { code?: string }) {
  console.error(`[resolution] ${where} failed`, { code: error.code });
  return new Error("A database error occurred. Please try again.");
}
