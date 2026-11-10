/**
 * Phase 6 — facts extracted from chat by the real AI (made-up data only).
 * Run with: npm run test:ai   (uses free-tier quota; busy providers => skipped)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AIUnavailableError } from "@/lib/ai/llm";
import { addUserMessage, generateAssistantReply, getOrCreateConversation } from "@/modules/conversation/service";
import { createCase } from "@/modules/cases/repository";
import { loadCaseFacts } from "@/modules/facts/repository";
import { createTestUser, deleteTestUser, hasSupabase, type TestUser } from "../integration/helpers";

const hasAI = Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY);

describe.skipIf(!hasSupabase || !hasAI)("AI fact extraction", () => {
  let user: TestUser;
  beforeAll(async () => {
    user = await createTestUser("Extraction Test");
  });
  afterAll(async () => {
    await deleteTestUser(user);
  });

  async function say(ctx: { skip: (n?: string) => void }, caseId: string, conv: string, text: string) {
    const c = (await user.client.from("cases").select("*").eq("id", caseId).single()).data;
    try {
      await addUserMessage(user.client, c, conv, text);
      return await generateAssistantReply(user.client, c, conv);
    } catch (e) {
      if (e instanceof AIUnavailableError) ctx.skip("All free AI providers busy — rerun later");
      throw e;
    }
  }

  it("extracts the spec example without inventing the interest method", async (ctx) => {
    const c = await createCase(user.client, { state: "TG", lender_type: "individual" });
    const conv = await getOrCreateConversation(user.client, c.id);
    const { factsChanged } = await say(ctx, c.id, conv,
      "I borrowed ₹80,000 from a private lender. He charges 3 rupees per hundred every month. I have repaid ₹70,000, but he is demanding ₹95,000.");
    expect(factsChanged).toBeGreaterThan(0);

    const { facts, repayments } = await loadCaseFacts(user.client, c.id);
    expect(facts.principal_amount?.value).toBe(80000);
    expect(facts.interest_rate?.value).toBe(3);
    expect(facts.rate_period?.value).toBe("monthly");
    expect(facts.lender_demand?.value).toBe(95000);
    expect(facts.total_repaid_reported?.value).toBe(70000);
    // Not stated -> must not be filled in (spec: never silently choose a method)
    expect(facts.interest_type).toBeUndefined();
    expect(facts.interest_method).toBeUndefined();
    // Everything from chat is unverified and quoted
    expect(facts.principal_amount?.status).toBe("unverified");
    expect(facts.principal_amount?.sourceType).toBe("user_statement");
    expect(facts.principal_amount?.quote?.length).toBeGreaterThan(0);
    expect(repayments).toEqual([]); // a total is not an individual repayment

    const caseAfter = (await user.client.from("cases").select("case_status").eq("id", c.id).single()).data;
    expect(caseAfter?.case_status).toBe("awaiting_confirmation");
  });

  it("records individual repayments with dates, and 'I don't know' answers", async (ctx) => {
    const c = await createCase(user.client, { state: "AP", lender_type: "individual" });
    const conv = await getOrCreateConversation(user.client, c.id);
    await say(ctx, c.id, conv,
      "I took ₹1,00,000 on 5 March 2024. I paid ₹10,000 by UPI on 5 April 2024 and ₹15,000 in cash on 10 June 2024. I don't know if the interest is simple or compound.");
    const { facts, repayments } = await loadCaseFacts(user.client, c.id);
    expect(facts.principal_amount?.value).toBe(100000);
    expect(facts.borrowing_date?.value).toBe("2024-03-05");
    expect(repayments.map((r) => [r.amount, r.repayment_date]).sort()).toEqual([
      [10000, "2024-04-05"],
      [15000, "2024-06-10"],
    ]);
    expect(facts.interest_type?.status).toBe("missing");
  });
});
