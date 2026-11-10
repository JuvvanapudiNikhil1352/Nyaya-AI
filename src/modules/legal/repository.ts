import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "@/lib/ai/llm";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import type { CaseRecord } from "@/types/case";
import { describeKnownFacts } from "@/modules/conversation/service";
import { formatINR, formatISODate } from "@/modules/extraction/fields";
import { loadCaseFacts } from "@/modules/facts/repository";
import type { AnalysisResult } from "@/modules/financial/engine";
import { loadLatestAnalysis } from "@/modules/financial/repository";
import { lenderTypeForSearch, searchLegalMany } from "@/modules/legal-rag/search";
import {
  aiLegalSchema,
  buildLegalPrompt,
  buildQueries,
  checkAssessment,
  LEGAL_JSON_SCHEMA,
  lawyerTriggers,
  notCovered,
  type CaseSignals,
  type CheckedAssessment,
  type Passage,
} from "./assessment";

export class LegalAssessmentError extends Error {}

export const ASSESSMENT_VERSION = "1.0.0";
const CONFIRMED = ["confirmed", "analysed", "resolution_selected"];

export type LegalAssessmentResult = CheckedAssessment & {
  version: string;
  state: "AP" | "TG";
  safetyConcern: boolean;
  lawyer: { recommended: boolean; reasons: string[] };
  notCovered: string[];
  passages: Passage[];
  model: string | null;
  basedOnAnalysisAt: string | null;
};

/** Plain-text financial results for the prompt (figures from the engine, never recomputed). */
export function describeFinancials(r: AnalysisResult | null): string {
  if (!r) return "No financial analysis has been run yet.";
  if (r.status === "insufficient") return `The balance could not be calculated. Missing: ${r.missing.join(", ")}.`;
  const lines: string[] = [];
  const primary = r.scenarios.find((s) => s.key === r.primaryKey);
  if (primary) lines.push(`Calculated balance (${primary.label.toLowerCase()}): ${formatINR(primary.balance)} on ${formatISODate(r.asOfDate!)}.`);
  else if (r.range) lines.push(`Loan terms partly unknown: calculated balance between ${formatINR(r.range.min)} and ${formatINR(r.range.max)} on ${formatISODate(r.asOfDate!)}.`);
  if (r.lenderDemand !== null) lines.push(`Lender's demand: ${formatINR(r.lenderDemand)}.`);
  lines.push(`Total repaid: ${formatINR(r.totalRepaid)}.`);
  if (r.rateSummary) lines.push(`Interest rate: ${r.rateSummary.rate}% per ${r.rateSummary.ratePeriod === "monthly" ? "month" : "year"} (${r.rateSummary.perYearSimple}% per year simple).`);
  if (r.chargesNeedingReview.length) lines.push(`${r.chargesNeedingReview.length} extra charge(s) claimed without a confirmed written agreement.`);
  return lines.join("\n");
}

export async function runLegalAssessment(supabase: SupabaseClient, c: CaseRecord): Promise<LegalAssessmentResult> {
  if (!CONFIRMED.includes(c.case_status)) throw new LegalAssessmentError("Please confirm your case summary first.");
  if (!c.state) throw new LegalAssessmentError("Please choose the state (Andhra Pradesh or Telangana) in the case details first.");
  await enforceRateLimit(supabase, "legal:assess");
  await enforceRateLimit(supabase, "legal:daily");

  const [facts, analysis, verified] = await Promise.all([
    loadCaseFacts(supabase, c.id),
    loadLatestAnalysis(supabase, c.id),
    supabase.from("legal_sources").select("title").eq("verification_status", "verified"),
  ]);
  if (verified.error) throw new Error("Could not load legal sources.");
  const r = analysis?.result ?? null;
  const primary = r?.scenarios.find((s) => s.key === r.primaryKey);
  const signals: CaseSignals = {
    state: c.state,
    safetyConcern: c.safety_concern,
    hasCharges: facts.charges.length > 0,
    compound: facts.facts.interest_type?.value === "compound" ? true : facts.facts.interest_type?.value === "simple" ? false : null,
    demandAboveCalculation: r?.lenderDemand != null && r.range ? r.lenderDemand > (primary?.balance ?? r.range.max) + 1 : null,
  };
  const missingTopics = notCovered((verified.data ?? []).map((s) => s.title), signals);

  const found = await searchLegalMany(supabase, buildQueries(signals), { state: c.state, lenderType: lenderTypeForSearch(c.lender_type) }, { limit: 8 });
  const passages: Passage[] = found.map((p, i) => ({
    label: `P${i + 1}`,
    chunkId: p.chunkId,
    sourceTitle: p.sourceTitle,
    sourceUrl: p.sourceUrl,
    documentVersion: p.documentVersion,
    sectionReference: p.sectionReference,
    content: p.content,
  }));

  let checked: CheckedAssessment;
  let model: string | null = null;
  if (passages.length === 0) {
    checked = {
      summary: "None of our verified legal sources matched this case closely enough to explain it reliably. Please speak to free legal aid or a lawyer.",
      points: [], factsNeeded: [], lawyerNeeded: true, lawyerReason: "", removed: [],
    };
  } else {
    const message = [
      `STATE: ${c.state === "TG" ? "Telangana" : "Andhra Pradesh"}. Lender: informal private lender.`,
      `CASE FACTS:\n${describeKnownFacts(facts)}`,
      c.safety_concern ? "The borrower has reported threats or harassment." : "",
      `FINANCIAL RESULTS:\n${describeFinancials(r)}`,
      `LEGAL PASSAGES:\n${passages.map((p) => `[${p.label}] ${p.sourceTitle} — ${p.sectionReference ?? "extract"}\n${p.content}`).join("\n\n")}`,
    ].filter(Boolean).join("\n\n");
    const result = await generateJson({
      system: buildLegalPrompt(),
      messages: [{ role: "user", content: message }],
      jsonSchema: LEGAL_JSON_SCHEMA,
      schemaName: "legal_assessment",
      validate: aiLegalSchema,
      temperature: 0.1,
      maxOutputTokens: 3000,
      timeoutMs: 60_000,
    });
    checked = checkAssessment(result.data, passages);
    model = result.model;
  }

  const reasons = lawyerTriggers({ ...signals, notCoveredCount: missingTopics.length }, checked.lawyerNeeded);
  const assessment: LegalAssessmentResult = {
    ...checked,
    version: ASSESSMENT_VERSION,
    state: c.state,
    safetyConcern: c.safety_concern,
    lawyer: { recommended: reasons.length > 0, reasons },
    notCovered: missingTopics,
    passages,
    model,
    basedOnAnalysisAt: analysis?.createdAt ?? null,
  };

  const { error } = await supabase.from("legal_assessments").insert({
    case_id: c.id,
    assessment,
    citations: passages.map((p) => ({ label: p.label, chunk_id: p.chunkId, source: p.sourceTitle, section: p.sectionReference, url: p.sourceUrl })),
    uncertainty_notes: [...missingTopics.map((t) => `Not covered: ${t}`), ...checked.removed.map((x) => `Removed "${x.title}": ${x.reason}`)],
  });
  if (error) {
    console.error("[legal] save failed", { code: error.code });
    throw new Error("A database error occurred. Please try again.");
  }
  return assessment;
}

export async function loadLatestLegal(supabase: SupabaseClient, caseId: string): Promise<{ result: LegalAssessmentResult; createdAt: string } | null> {
  const { data, error } = await supabase
    .from("legal_assessments")
    .select("assessment, created_at")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[legal] load failed", { code: error.code });
    throw new Error("A database error occurred. Please try again.");
  }
  return data ? { result: data.assessment as LegalAssessmentResult, createdAt: data.created_at } : null;
}
