/**
 * Phase 8 — calculation engine. Expected values are calculated independently
 * by hand / with a separate formula, not by running the engine.
 */
import { describe, expect, it } from "vitest";
import { addMonths, calendarMonths, days30360, daysBetween } from "@/modules/financial/dates";
import { analyseLoan, round2, solveMonthlyRate, type EngineInput } from "@/modules/financial/engine";

const base: EngineInput = {
  principal: 100000,
  borrowingDate: "2024-01-01",
  interestRate: 2,
  ratePeriod: "monthly",
  interestType: "simple",
  interestMethod: "reducing",
  compoundingFrequency: "unknown",
  dayCount: "unknown",
  allocation: "interest_first",
  tenureMonths: null,
  amountActuallyReceived: null,
  lenderDemand: null,
  lenderDemandDate: "2025-01-01",
  totalRepaidReported: null,
  repayments: [],
  charges: [],
  today: "2026-11-11",
};
const run = (over: Partial<EngineInput>) => analyseLoan({ ...base, ...over });
const scenario = (r: ReturnType<typeof analyseLoan>, key: string) => r.scenarios.find((s) => s.key === key)!;

describe("dates", () => {
  it("adds months and clamps to the month's end", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2023-01-31", 1)).toBe("2023-02-28");
    expect(addMonths("2024-11-15", 3)).toBe("2025-02-15");
  });
  it("counts calendar months with part-months in proportion", () => {
    expect(calendarMonths("2024-01-01", "2025-01-01")).toBe(12);
    expect(calendarMonths("2024-01-31", "2024-02-29")).toBe(1);
    expect(calendarMonths("2024-04-01", "2024-04-16")).toBeCloseTo(0.5, 10); // 15 of 30 days
    expect(daysBetween("2024-01-01", "2025-01-01")).toBe(366);
    expect(days30360("2024-01-31", "2024-03-31")).toBe(60);
  });
});

describe("spec Test 1 — flat interest", () => {
  const r = run({
    principal: 100000, interestRate: 10, ratePeriod: "annual", interestMethod: "flat", tenureMonths: 12,
    borrowingDate: "2025-01-01", lenderDemandDate: "2026-01-01",
  });
  it("charges 10% of the original amount for one year", () => {
    expect(r.status).toBe("complete");
    expect(scenario(r, "flat").totalInterest).toBe(10000);
    expect(scenario(r, "flat").balance).toBe(110000);
  });
  it("explains the effective cost: ₹9,166.67 a month ≈ 17.97% a year on a reducing balance", () => {
    expect(r.flatTermSummary).toMatchObject({ totalInterest: 10000, totalPayable: 110000, monthlyInstalment: 9166.67 });
    expect(r.flatTermSummary!.equivalentReducingRate).toBeCloseTo(17.97, 2);
  });
});

describe("spec Test 2 — monthly compound interest", () => {
  it("₹80,000 at 3% a month compounded monthly for 12 months = 80,000 × 1.03¹² = ₹1,14,060.87", () => {
    const r = run({
      principal: 80000, interestRate: 3, interestType: "compound", compoundingFrequency: "monthly",
      borrowingDate: "2024-01-15", lenderDemandDate: "2025-01-15",
    });
    expect(r.status).toBe("complete");
    expect(Math.abs(scenario(r, "compound").balance - 114060.87)).toBeLessThanOrEqual(0.05);
    expect(r.rateSummary).toMatchObject({ perYearSimple: 36, perYearCompounded: 42.58 });
  });
  it("quarterly compounding gives less than monthly", () => {
    const q = run({ principal: 80000, interestRate: 3, interestType: "compound", compoundingFrequency: "quarterly" });
    const m = run({ principal: 80000, interestRate: 3, interestType: "compound", compoundingFrequency: "monthly" });
    expect(scenario(q, "compound").balance).toBeLessThan(scenario(m, "compound").balance);
    // 4 quarters, each 9% simple then added: 80,000 × 1.09⁴
    expect(Math.abs(scenario(q, "compound").balance - 112926.53)).toBeLessThanOrEqual(0.05);
  });
});

describe("spec Test 3 — partial repayments on their dates", () => {
  const repayments = [
    { date: "2024-04-01", amount: 20000 },
    { date: "2024-07-01", amount: 20000 },
    { date: "2024-10-01", amount: 20000 },
  ];
  it("reducing balance: interest only on what is still owed (hand-calculated ₹58,755.38)", () => {
    // 6,000 → P 86,000; 5,160 → P 71,160; 4,269.60 → P 55,429.60; 3,325.78 → 58,755.38
    const r = run({ repayments });
    const s = scenario(r, "simple_reducing");
    expect(s.totalInterest).toBe(18755.38);
    expect(s.totalRepaid).toBe(60000);
    expect(s.balance).toBe(58755.38);
    expect(s.steps.filter((x) => x.kind === "repayment").map((x) => x.principalBalance)).toEqual([86000, 71160, 55429.6]);
  });
  it("flat: part-payments don't reduce the interest (1,00,000 + 24,000 − 60,000)", () => {
    const s = scenario(run({ repayments, interestMethod: "flat" }), "flat");
    expect(s.totalInterest).toBe(24000);
    expect(s.balance).toBe(64000);
  });
  it("paying principal first lowers interest under the reducing method", () => {
    const interestFirst = scenario(run({ repayments }), "simple_reducing").balance;
    const principalFirst = scenario(run({ repayments, allocation: "principal_first" }), "simple_reducing").balance;
    expect(principalFirst).toBeLessThan(interestFirst);
  });
  it("compound with the same payments costs more than simple", () => {
    const r = run({ repayments, interestType: "compound", compoundingFrequency: "monthly" });
    expect(scenario(r, "compound").balance).toBeGreaterThan(58755.38);
  });
});

describe("spec Test 4 — extra charges without a written basis", () => {
  it("are listed for examination, not added and not called illegal", () => {
    const r = run({ charges: [{ date: "2024-06-01", amount: 5000, label: "Late fee", hasWrittenBasis: "unknown" }] });
    expect(scenario(r, "simple_reducing").chargesIncluded).toBe(0);
    expect(scenario(r, "simple_reducing").balance).toBe(124000); // 1,00,000 + 12 × 2,000
    expect(r.chargesNeedingReview).toEqual([{ label: "Late fee", amount: 5000, hasWrittenBasis: "unknown" }]);
    expect(r.assumptions.join(" ")).toMatch(/does not mean they are illegal/);
  });
  it("charges in a written agreement are included and paid by the chosen order", () => {
    const r = run({ charges: [{ date: "2024-06-01", amount: 5000, label: "Agreed fee", hasWrittenBasis: "yes" }] });
    expect(scenario(r, "simple_reducing").chargesIncluded).toBe(5000);
    expect(scenario(r, "simple_reducing").balance).toBe(129000);
  });
});

describe("spec example — ₹80,000 at 3% a month, ₹70,000 repaid, lender demands ₹95,000", () => {
  const repayments = [1, 2, 3, 4, 5, 6, 7].map((m) => ({ date: `2024-0${m + 1}-01`, amount: 10000 }));
  const r = run({ principal: 80000, interestRate: 3, interestType: "unknown", interestMethod: "unknown", repayments, lenderDemand: 95000 });

  it("calculates every possible method because the terms are unknown", () => {
    expect(r.status).toBe("scenarios");
    expect(r.primaryKey).toBeNull();
    expect(r.scenarios.map((s) => s.key)).toEqual(["flat", "simple_reducing", "compound"]);
    expect(r.assumptions.join(" ")).toMatch(/each possible method/);
  });
  it("gives hand-checked balances and the difference from the demand", () => {
    expect(scenario(r, "flat").balance).toBe(38800); // 80,000 + 28,800 − 70,000
    expect(scenario(r, "flat").discrepancy).toBe(56200);
    expect(scenario(r, "simple_reducing").balance).toBe(25030.07);
    expect(scenario(r, "simple_reducing").discrepancy).toBe(69969.93);
    expect(r.range!.max).toBe(38800);
    expect(r.range!.min).toBe(Math.min(...r.scenarios.map((s) => s.balance)));
  });
});

describe("missing information and edge cases", () => {
  it("does not calculate without the essential facts", () => {
    const r = run({ interestRate: null, ratePeriod: "unknown" });
    expect(r.status).toBe("insufficient");
    expect(r.scenarios).toEqual([]);
    expect(r.missing).toEqual(["Interest rate", "Whether the rate is per month or per year"]);
  });
  it("uses a reported total when payments aren't listed, and says so", () => {
    const r = run({ totalRepaidReported: 30000 });
    expect(r.totalRepaid).toBe(30000);
    expect(scenario(r, "simple_reducing").balance).toBe(94000); // 1,24,000 − 30,000 on the calculation date
    expect(r.assumptions.join(" ")).toMatch(/total you reported/);
  });
  it("warns when listed payments don't match the reported total", () => {
    const r = run({ repayments: [{ date: "2024-03-01", amount: 10000 }], totalRepaidReported: 15000 });
    expect(r.warnings.join(" ")).toMatch(/add up to ₹10,000/);
  });
  it("leaves out payments dated before the loan, and stops interest once fully repaid", () => {
    const r = run({ repayments: [{ date: "2023-12-01", amount: 5000 }, { date: "2024-02-01", amount: 150000 }] });
    expect(r.warnings.join(" ")).toMatch(/before the loan date/);
    const s = scenario(r, "simple_reducing");
    expect(s.balance).toBe(-48000); // paid 1,50,000 against 1,02,000 owed: overpaid, no more interest
    expect(s.totalInterest).toBe(2000);
  });
  it("calculates to today when there is no demand date", () => {
    const r = run({ lenderDemandDate: null });
    expect(r.asOfDate).toBe("2026-11-11");
  });
  it("warns that less money was received than borrowed", () => {
    expect(run({ amountActuallyReceived: 90000 }).warnings.join(" ")).toMatch(/You received ₹90,000/);
  });
  it("is deterministic", () => {
    expect(run({ interestType: "unknown", interestMethod: "unknown" })).toEqual(run({ interestType: "unknown", interestMethod: "unknown" }));
  });
  it("rounds to the paisa correctly", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-2.675)).toBe(-2.68);
    expect(solveMonthlyRate(100000, 100000 / 12, 12)).toBe(0);
  });
});
