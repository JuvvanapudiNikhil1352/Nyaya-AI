/**
 * Phase 12 — choosing a resolution path and the action plan, on the real database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCase, deleteCase, getCase } from "@/modules/cases/repository";
import { confirmSummary, setFactValue } from "@/modules/facts/repository";
import { runAnalysis } from "@/modules/financial/repository";
import { loadActivePlan, ResolutionError, selectResolution, setStepDone } from "@/modules/resolution/repository";
import { createTestUser, deleteTestUser, hasSupabase, type TestUser } from "./helpers";

describe.skipIf(!hasSupabase)("Resolution and action plan", () => {
  let a: TestUser;
  let b: TestUser;
  beforeAll(async () => {
    a = await createTestUser("Plan Owner");
    b = await createTestUser("Plan Other");
  });
  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });
  const refresh = async (id: string) => (await getCase(a.client, id))!;

  it("needs a confirmed case; saves the chosen path; archives the old plan; ticks steps; stays private", async () => {
    let c = await createCase(a.client, { state: "TG", lender_type: "individual" });
    await expect(selectResolution(a.client, c, "clarification")).rejects.toBeInstanceOf(ResolutionError);

    for (const [f, v] of [["principal_amount", 100000], ["borrowing_date", "2024-01-01"], ["interest_rate", 2], ["rate_period", "monthly"], ["interest_type", "simple"], ["interest_method", "flat"], ["lender_demand", 150000], ["lender_demand_date", "2025-01-01"]] as const) {
      await setFactValue(a.client, c, f, v, false);
    }
    await confirmSummary(a.client, await refresh(c.id));
    await runAnalysis(a.client, await refresh(c.id));
    c = await refresh(c.id);

    const first = await selectResolution(a.client, c, "negotiation");
    expect(first.recommendation.recommended).toBe("clarification"); // ₹1,50,000 demanded vs ₹1,24,000 calculated
    expect(first.choseRecommended).toBe(false); // the borrower's choice is respected
    expect((await refresh(c.id)).case_status).toBe("resolution_selected");

    const second = await selectResolution(a.client, await refresh(c.id), "clarification");
    expect(second.choseRecommended).toBe(true);
    const active = await loadActivePlan(a.client, c.id);
    expect(active!.id).toBe(second.id);
    const all = await a.client.from("action_plans").select("status").eq("case_id", c.id);
    expect(all.data!.map((p) => p.status).sort()).toEqual(["active", "archived"]);
    expect(active!.steps.find((s) => s.id === "request-breakdown")!.detail).toMatch(/₹1,50,000/);

    await setStepDone(a.client, c, second.id, "request-breakdown", true);
    expect((await loadActivePlan(a.client, c.id))!.steps.find((s) => s.id === "request-breakdown")!.done).toBe(true);
    await expect(setStepDone(a.client, c, second.id, "no-such-step", true)).rejects.toBeInstanceOf(ResolutionError);

    expect(await loadActivePlan(b.client, c.id)).toBeNull();
    await expect(setStepDone(b.client, c, second.id, "request-breakdown", false)).rejects.toThrow();
    await deleteCase(a.client, c.id);
  });
});
