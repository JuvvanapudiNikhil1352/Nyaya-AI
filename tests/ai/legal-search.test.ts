/**
 * Phase 10 — semantic search over VERIFIED legal sources (uses Gemini embeddings).
 * Run with: npm run test:ai -- tests/ai/legal-search.test.ts
 * Skipped until the sources are verified (npm run legal:verify).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AIUnavailableError } from "@/lib/ai/llm";
import { searchLegal } from "@/modules/legal-rag/search";
import { adminClient, createTestUser, deleteTestUser, hasSupabase, type TestUser } from "../integration/helpers";

const hasGemini = Boolean(process.env.GEMINI_API_KEY);

describe.skipIf(!hasSupabase || !hasGemini)("Legal search", () => {
  let user: TestUser;
  let verified: string[] = [];
  beforeAll(async () => {
    user = await createTestUser("Legal Search Test");
    verified = ((await adminClient().from("legal_sources").select("title").eq("verification_status", "verified")).data ?? []).map((s) => s.title);
  });
  afterAll(async () => {
    await deleteTestUser(user);
  });

  async function top(ctx: { skip: (n?: string) => void }, query: string, state: "AP" | "TG") {
    try {
      return await searchLegal(user.client, query, { state, lenderType: "individual" });
    } catch (e) {
      if (e instanceof AIUnavailableError) ctx.skip("Gemini busy — rerun later");
      throw e;
    }
  }

  it("finds the court's power to re-open a loan with excessive interest", async (ctx) => {
    if (!verified.includes("The Usurious Loans Act, 1918")) ctx.skip("Verify the Usurious Loans Act first");
    const r = await top(ctx, "The lender charges very high interest. Can a court reduce excessive interest and reopen the loan?", "TG");
    expect(r[0]).toMatchObject({ sourceTitle: "The Usurious Loans Act, 1918", sectionReference: expect.stringMatching(/^Section 3/) });
    expect(r[0].sourceUrl).toMatch(/^https:\/\//);
  });

  it("finds who can get free legal aid", async (ctx) => {
    if (!verified.includes("The Legal Services Authorities Act, 1987")) ctx.skip("Verify the Legal Services Authorities Act first");
    const r = await top(ctx, "I cannot afford a lawyer. Am I eligible for free legal aid?", "AP");
    expect(r.slice(0, 2).map((p) => p.sourceTitle)).toContain("The Legal Services Authorities Act, 1987");
  });
});
