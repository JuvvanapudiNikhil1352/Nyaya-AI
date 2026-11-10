/**
 * Phase 11 — legal assessment end to end with the real AI and verified sources.
 * Run with: npm run test:ai -- tests/ai/legal-assessment.test.ts   (2 AI calls + ~12 embeddings)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AIUnavailableError } from "@/lib/ai/llm";
import { createCase, getCase } from "@/modules/cases/repository";
import { confirmSummary, saveCharge, saveRepayment, setFactValue } from "@/modules/facts/repository";
import { runAnalysis } from "@/modules/financial/repository";
import { claimsIllegality } from "@/modules/legal/assessment";
import { runLegalAssessment } from "@/modules/legal/repository";
import { adminClient, createTestUser, deleteTestUser, hasSupabase, type TestUser } from "../integration/helpers";

const hasAI = Boolean(process.env.GEMINI_API_KEY && (process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY));

describe.skipIf(!hasSupabase || !hasAI)("Legal assessment", () => {
  let user: TestUser;
  let verifiedTitles: string[] = [];
  beforeAll(async () => {
    user = await createTestUser("Legal Assessment Test");
    verifiedTitles = ((await adminClient().from("legal_sources").select("title").eq("verification_status", "verified")).data ?? []).map((s) => s.title);
  });
  afterAll(async () => {
    await deleteTestUser(user);
  });

  async function specCase(safety: boolean) {
    let c = await createCase(user.client, { state: "TG", lender_type: "individual" });
    for (const [f, v] of [["principal_amount", 80000], ["borrowing_date", "2024-01-01"], ["interest_rate", 3], ["rate_period", "monthly"], ["lender_demand", 95000], ["lender_demand_date", "2025-01-01"]] as const) {
      await setFactValue(user.client, c, f, v, false);
    }
    for (let m = 2; m <= 8; m++) {
      await saveRepayment(user.client, c, { amount: 10000, repayment_date: `2024-0${m}-01`, date_is_approximate: false, payment_method: "cash", description: null });
    }
    await saveCharge(user.client, c, { amount: 5000, charge_date: "2024-10-01", charge_type: "penalty", has_written_basis: "unknown", description: "Late penalty" });
    if (safety) await user.client.from("cases").update({ safety_concern: true }).eq("id", c.id);
    await confirmSummary(user.client, (await getCase(user.client, c.id))!);
    c = (await getCase(user.client, c.id))!;
    await runAnalysis(user.client, c);
    return (await getCase(user.client, c.id))!;
  }

  async function assess(ctx: { skip: (n?: string) => void }, safety: boolean) {
    const c = await specCase(safety);
    try {
      return await runLegalAssessment(user.client, c);
    } catch (e) {
      if (e instanceof AIUnavailableError) ctx.skip("AI busy — rerun later");
      throw e;
    }
  }

  it("the spec example: grounded points only, careful wording, gaps declared", async (ctx) => {
    const r = await assess(ctx, false);
    expect(r.passages.length).toBeGreaterThan(0);
    // Every passage comes from a verified source
    for (const p of r.passages) expect(verifiedTitles).toContain(p.sourceTitle);
    // Every point cites at least one retrieved passage
    expect(r.points.length).toBeGreaterThan(0);
    const labels = new Set(r.passages.map((p) => p.label));
    for (const p of r.points) {
      expect(p.citations.length).toBeGreaterThan(0);
      for (const l of p.citations) expect(labels.has(l)).toBe(true);
    }
    // The excessive-interest power is found for a 3%-a-month loan with a disputed demand
    expect(r.passages.some((p) => p.sourceTitle.includes("Usurious") && p.sectionReference?.startsWith("Section 3"))).toBe(true);
    // No conclusion of illegality anywhere
    for (const text of [r.summary, ...r.points.flatMap((p) => [p.title, p.explanation])]) expect(claimsIllegality(text)).toBe(false);
    // Telangana's money-lending Act is not verified yet → declared, not invented
    expect(r.notCovered).toContain("Telangana money-lending law (licence and registration of money lenders)");
    expect(r.lawyer.recommended).toBe(true);
    console.log(JSON.stringify({ summary: r.summary, points: r.points, factsNeeded: r.factsNeeded, removed: r.removed, model: r.model }, null, 2));
  });

  it("spec Test 5: threats → professional help recommended and criminal-law gap declared", async (ctx) => {
    const r = await assess(ctx, true);
    expect(r.safetyConcern).toBe(true);
    expect(r.lawyer.reasons).toContain("You reported threats or harassment.");
    expect(r.notCovered).toContain("Criminal law on threats and intimidation (Bharatiya Nyaya Sanhita, 2023)");
  });
});
