/**
 * Phase 7 — reading made-up sample documents with the real AI (Gemini).
 * Run with: npm run test:ai   (uses 3 document reads of free quota; busy => skipped)
 * Create the samples first: node scripts/make-sample-docs.mjs
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AIUnavailableError } from "@/lib/ai/llm";
import { createCase, getCase } from "@/modules/cases/repository";
import { loadEvidence, readDocument, uploadDocument } from "@/modules/documents/repository";
import { loadCaseFacts } from "@/modules/facts/repository";
import { createTestUser, deleteTestUser, hasSupabase, type TestUser } from "../integration/helpers";

const hasGemini = Boolean(process.env.GEMINI_API_KEY);
const sample = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

describe.skipIf(!hasSupabase || !hasGemini)("AI document reading", () => {
  let user: TestUser;
  let caseId: string;
  beforeAll(async () => {
    user = await createTestUser("Document Reading Test");
    caseId = (await createCase(user.client, { state: "TG", lender_type: "individual" })).id;
  });
  afterAll(async () => {
    await deleteTestUser(user);
  });

  async function uploadAndRead(ctx: { skip: (n?: string) => void }, name: string) {
    const c = (await getCase(user.client, caseId))!;
    const doc = await uploadDocument(user.client, c, { bytes: sample(name), name });
    try {
      return await readDocument(user.client, c, doc.id);
    } catch (e) {
      if (e instanceof AIUnavailableError) ctx.skip("Gemini busy or out of free quota — rerun later");
      throw e;
    }
  }

  it("reads a typed promissory note: amount, rate, date; does not invent the interest method", async (ctx) => {
    const { document } = await uploadAndRead(ctx, "sample-promissory-note.pdf");
    expect(["promissory_note", "loan_agreement"]).toContain(document.document_type);
    expect(document.extraction_status).toBe("completed");
    expect(document.is_handwritten).toBe(false);

    const { facts } = await loadCaseFacts(user.client, caseId);
    expect(facts.principal_amount).toMatchObject({ value: 80000, status: "unverified", sourceType: "uploaded_document" });
    expect(facts.interest_rate?.value).toBe(3);
    expect(facts.rate_period?.value).toBe("monthly");
    expect(facts.borrowing_date?.value).toBe("2024-03-05"); // DD/MM/YYYY read correctly
    expect(facts.interest_type?.value ?? null).toBeNull(); // simple/compound is not written: must not be guessed
    expect(facts.principal_amount?.quote).toBeTruthy();
  });

  it("reads a receipt as a dated repayment and updates the checklist", async (ctx) => {
    const { document } = await uploadAndRead(ctx, "sample-receipt.pdf");
    expect(["receipt", "repayment_record"]).toContain(document.document_type);
    const { repayments } = await loadCaseFacts(user.client, caseId);
    expect(repayments).toEqual(expect.arrayContaining([expect.objectContaining({ amount: 20000, repayment_date: "2024-06-10", source_type: "uploaded_document" })]));
    const { checklist } = await loadEvidence(user.client, caseId);
    expect(checklist.find((i) => i.key === "repayment_records")!.status).toBe("uploaded");
  });

  it("takes nothing from an unrelated document", async (ctx) => {
    const before = await loadCaseFacts(user.client, caseId);
    const { document, factsAdded } = await uploadAndRead(ctx, "sample-unrelated.pdf");
    expect(factsAdded).toBe(0);
    expect(document.extraction_status).toBe("needs_review");
    const after = await loadCaseFacts(user.client, caseId);
    expect(after.repayments.length).toBe(before.repayments.length);
  });
});
