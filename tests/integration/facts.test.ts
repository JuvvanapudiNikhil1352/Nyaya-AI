/**
 * Phase 6 — case facts against the real database (no AI calls).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase, getCase } from "@/modules/cases/repository";
import { getOrCreateConversation } from "@/modules/conversation/service";
import {
  applyExtraction,
  confirmFact,
  confirmSummary,
  ConfirmationError,
  deleteItem,
  loadCaseFacts,
  markFactUnknown,
  saveRepayment,
  setFactValue,
} from "@/modules/facts/repository";
import type { CaseRecord } from "@/types/case";
import { createTestUser, deleteTestUser, hasSupabase, type TestUser } from "./helpers";

describe.skipIf(!hasSupabase)("Case facts", () => {
  let a: TestUser;
  let b: TestUser;
  beforeAll(async () => {
    a = await createTestUser("Facts Owner");
    b = await createTestUser("Facts Other");
  });
  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });

  async function newCaseWithMessage(): Promise<{ c: CaseRecord; messageId: string }> {
    const c = await createCase(a.client, { state: "TG", lender_type: "individual" });
    const conv = await getOrCreateConversation(a.client, c.id);
    const { data } = await a.client
      .from("messages")
      .insert({ conversation_id: conv, role: "user", content: "test" })
      .select("id")
      .single();
    return { c, messageId: data!.id };
  }
  const refresh = async (id: string) => (await getCase(a.client, id))!;

  it("applies extracted facts as unverified with quotes, de-duplicates, and moves the case to awaiting confirmation", async () => {
    const { c, messageId } = await newCaseWithMessage();
    const extraction = {
      facts: [
        { field: "principal_amount" as const, kind: "value" as const, value: 80000, approximate: false, confidence: 0.9, quote: "I borrowed ₹80,000" },
        { field: "lender_demand" as const, kind: "value" as const, value: 95000, approximate: false, confidence: 0.9, quote: "demanding ₹95,000" },
      ],
      repayments: [{ amount: 10000, date: "2024-04-05", approximate: false, method: "upi" as const, quote: "paid 10,000" }],
      charges: [],
    };
    expect(await applyExtraction(a.client, c, messageId, extraction)).toBe(3);
    // Same message again: nothing new
    expect(await applyExtraction(a.client, await refresh(c.id), messageId, extraction)).toBe(0);

    const data = await loadCaseFacts(a.client, c.id);
    expect(data.facts.principal_amount).toMatchObject({ value: 80000, status: "unverified", sourceType: "user_statement", quote: "I borrowed ₹80,000" });
    expect(data.repayments).toHaveLength(1);
    expect(data.repayments[0]).toMatchObject({ amount: 10000, repayment_date: "2024-04-05", source_quote: "paid 10,000" });
    expect((await refresh(c.id)).case_status).toBe("awaiting_confirmation");
  });

  it("a contradiction of a confirmed value becomes 'disputed' and blocks confirmation until resolved", async () => {
    const { c, messageId } = await newCaseWithMessage();
    await setFactValue(a.client, c, "principal_amount", 80000, false); // user-entered = corrected
    await applyExtraction(a.client, await refresh(c.id), messageId, {
      facts: [{ field: "principal_amount", kind: "value", value: 85000, approximate: false, confidence: 0.9, quote: "it was 85,000" }],
      repayments: [], charges: [],
    });
    let data = await loadCaseFacts(a.client, c.id);
    expect(data.facts.principal_amount).toMatchObject({ value: 85000, status: "disputed", previousConfirmed: 80000 });
    expect(data.hasDisputes).toBe(true);
    await expect(confirmSummary(a.client, await refresh(c.id))).rejects.toBeInstanceOf(ConfirmationError);

    // Resolve: keep the earlier value
    await setFactValue(a.client, await refresh(c.id), "principal_amount", 80000, false);
    data = await loadCaseFacts(a.client, c.id);
    expect(data.facts.principal_amount).toMatchObject({ value: 80000, status: "corrected" });
    expect(data.hasDisputes).toBe(false);
  });

  it("'I don't know' is recorded and still listed as missing", async () => {
    const { c } = await newCaseWithMessage();
    await markFactUnknown(a.client, c, "interest_type");
    const data = await loadCaseFacts(a.client, c.id);
    expect(data.facts.interest_type).toMatchObject({ value: null, status: "missing" });
    expect(data.missing.map((m) => m.key)).toContain("interest_type");
  });

  it("confirming writes the loan record for the calculator, keeps unknowns explicit, and allows missing info", async () => {
    const { c, messageId } = await newCaseWithMessage();
    await applyExtraction(a.client, c, messageId, {
      facts: [
        { field: "principal_amount", kind: "value", value: 100000, approximate: false, confidence: 0.9, quote: "1 lakh" },
        { field: "interest_rate", kind: "value", value: 2, approximate: false, confidence: 0.7, quote: "2 rupees per hundred" },
        { field: "rate_period", kind: "value", value: "monthly", approximate: false, confidence: 0.7, quote: "per month" },
        { field: "borrowing_date", kind: "value", value: "2024-03-01", approximate: true, confidence: 0.9, quote: "March 2024" },
      ],
      repayments: [{ amount: 5000, date: null, approximate: false, method: "cash", quote: "5000 cash" }],
      charges: [],
    });
    const { missing } = await confirmSummary(a.client, await refresh(c.id));
    expect(missing.map((m) => m.key)).toEqual(expect.arrayContaining(["interest_type", "lender_demand"]));

    const { data: loan } = await a.client.from("loan_details").select("*").eq("case_id", c.id).single();
    expect(Number(loan.principal_amount)).toBe(100000);
    expect(Number(loan.interest_rate)).toBe(2);
    expect(loan.rate_period).toBe("monthly");
    expect(loan.borrowing_date).toBe("2024-03-01");
    expect(loan.interest_type).toBe("unknown"); // never silently chosen
    expect(loan.lender_demand).toBeNull();
    expect(loan.confirmation_status).toBe("confirmed");

    const after = await loadCaseFacts(a.client, c.id);
    expect(after.unverifiedCount).toBe(0);
    expect(after.facts.interest_rate?.status).toBe("confirmed");
    expect(after.repayments[0].confirmation_status).toBe("confirmed");
    const status = await refresh(c.id);
    expect(status.case_status).toBe("confirmed");
    expect(status.confirmed_at).not.toBeNull();

    // Any later change requires re-confirmation
    await saveRepayment(a.client, status, { amount: 2000, repayment_date: "2024-05-01", date_is_approximate: false, payment_method: "upi", description: null });
    expect((await refresh(c.id)).case_status).toBe("awaiting_confirmation");
  });

  it("cannot confirm without the amount borrowed", async () => {
    const { c } = await newCaseWithMessage();
    await expect(confirmSummary(a.client, c)).rejects.toBeInstanceOf(ConfirmationError);
  });

  it("another user cannot read or change this case's facts", async () => {
    const { c, messageId } = await newCaseWithMessage();
    await applyExtraction(a.client, c, messageId, {
      facts: [{ field: "principal_amount", kind: "value", value: 50000, approximate: false, confidence: 0.9, quote: "50k" }],
      repayments: [{ amount: 1000, date: null, approximate: false, method: "cash", quote: "1000" }],
      charges: [],
    });
    const theirs = await loadCaseFacts(b.client, c.id);
    expect(theirs.facts).toEqual({});
    expect(theirs.repayments).toEqual([]);

    await expect(setFactValue(b.client, c, "principal_amount", 1, false)).rejects.toThrow();
    const rp = (await loadCaseFacts(a.client, c.id)).repayments[0];
    await expect(deleteItem(b.client, c, "repayments", rp.id)).rejects.toThrow();
    await expect(confirmFact(b.client, c, "principal_amount")).rejects.toThrow();
    expect((await loadCaseFacts(a.client, c.id)).facts.principal_amount?.value).toBe(50000);
  });
});
