/**
 * Phase 8 — financial analysis against the real database (no AI).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase, deleteCase, getCase } from "@/modules/cases/repository";
import { confirmSummary, saveRepayment, setFactValue } from "@/modules/facts/repository";
import { explainAnalysis } from "@/modules/financial/explain";
import { AnalysisError, loadLatestAnalysis, runAnalysis } from "@/modules/financial/repository";
import { createTestUser, deleteTestUser, hasSupabase, type TestUser } from "./helpers";

describe.skipIf(!hasSupabase)("Financial analysis", () => {
  let a: TestUser;
  let b: TestUser;
  beforeAll(async () => {
    a = await createTestUser("Finance Owner");
    b = await createTestUser("Finance Other");
  });
  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });
  const refresh = async (id: string) => (await getCase(a.client, id))!;

  it("refuses to calculate before the summary is confirmed", async () => {
    const c = await createCase(a.client, { state: "TG", lender_type: "individual" });
    await expect(runAnalysis(a.client, c)).rejects.toBeInstanceOf(AnalysisError);
    await deleteCase(a.client, c.id);
  });

  it("calculates from confirmed facts only, saves the result and marks the case analysed", async () => {
    let c = await createCase(a.client, { state: "TG", lender_type: "individual" });
    await setFactValue(a.client, c, "principal_amount", 100000, false);
    await setFactValue(a.client, c, "borrowing_date", "2024-01-01", false);
    await setFactValue(a.client, c, "interest_rate", 2, false);
    await setFactValue(a.client, c, "rate_period", "monthly", false);
    await setFactValue(a.client, c, "interest_type", "simple", false);
    await setFactValue(a.client, c, "interest_method", "reducing", false);
    await setFactValue(a.client, c, "lender_demand", 70000, false);
    await setFactValue(a.client, c, "lender_demand_date", "2025-01-01", false);
    for (const date of ["2024-04-01", "2024-07-01", "2024-10-01"]) {
      await saveRepayment(a.client, c, { amount: 20000, repayment_date: date, date_is_approximate: false, payment_method: "cash", description: null });
    }
    await confirmSummary(a.client, await refresh(c.id));

    // An item added after confirmation (unverified) must not be used
    await a.client.from("repayments").insert({ case_id: c.id, amount: 99999, repayment_date: "2024-05-01", source_type: "user_statement" });
    c = await refresh(c.id);
    await a.client.from("cases").update({ case_status: "confirmed" }).eq("id", c.id); // simulate re-confirmation of the rest
    c = await refresh(c.id);

    const r = await runAnalysis(a.client, c);
    expect(r.status).toBe("complete");
    expect(r.totalRepaid).toBe(60000);
    expect(r.scenarios[0].balance).toBe(58755.38); // hand-calculated (see unit test, spec Test 3)
    expect(r.scenarios[0].discrepancy).toBe(11244.62);
    expect(explainAnalysis(r).join(" ")).toMatch(/₹11,244\.62 more than this calculation/);

    expect((await refresh(c.id)).case_status).toBe("analysed");
    const saved = await loadLatestAnalysis(a.client, c.id);
    expect(saved!.result.scenarios[0].balance).toBe(58755.38);
    const row = await a.client.from("financial_analyses").select("calculated_balance, discrepancy, engine_version, calculation_method").eq("case_id", c.id).single();
    expect(row.data).toMatchObject({ calculated_balance: 58755.38, discrepancy: 11244.62, engine_version: "1.0.0", calculation_method: "simple_reducing" });

    // Another user can't see it
    expect(await loadLatestAnalysis(b.client, c.id)).toBeNull();
    await deleteCase(a.client, c.id);
  });
});
