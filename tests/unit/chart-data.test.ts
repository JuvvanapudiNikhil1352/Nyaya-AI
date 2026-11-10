import { describe, expect, it } from "vitest";
import { balanceOn, balanceSeries, compactINR, niceScale } from "@/modules/financial/chart-data";
import { toUTC } from "@/modules/financial/dates";
import { analyseLoan } from "@/modules/financial/engine";

const r = analyseLoan({
  principal: 100000, borrowingDate: "2024-01-01", interestRate: 2, ratePeriod: "monthly",
  interestType: "simple", interestMethod: "unknown", compoundingFrequency: "unknown", dayCount: "unknown",
  allocation: "interest_first", tenureMonths: null, amountActuallyReceived: null, lenderDemand: 70000,
  lenderDemandDate: "2025-01-01", totalRepaidReported: null,
  repayments: [{ date: "2024-04-01", amount: 20000 }], charges: [], today: "2026-11-11",
});

describe("balanceSeries", () => {
  const series = balanceSeries(r);
  it("has one series per method, keyed by method", () => {
    expect(series.map((s) => s.key)).toEqual(["flat", "simple_reducing"]);
  });
  it("draws a repayment as a drop on the same date", () => {
    const reducing = series[1];
    const onDay = reducing.points.filter((p) => p.date === "2024-04-01");
    expect(onDay.map((p) => p.balance)).toEqual([106000, 86000]); // 1,00,000 + 3 × 2,000, then −20,000
    expect(onDay[1].note).toEqual({ kind: "repayment", amount: 20000, label: "Repayment" });
  });
  it("ends at the engine's balance", () => {
    for (const s of series) expect(s.points.at(-1)!.balance).toBe(r.scenarios.find((x) => x.key === s.key)!.balance);
  });
  it("reads the balance on a date (after any repayment that day)", () => {
    expect(balanceOn(series[1], toUTC("2024-04-01"))).toBe(86000);
    expect(balanceOn(series[1], toUTC("2023-12-31"))).toBeNull();
  });
});

describe("axis helpers", () => {
  it("picks round axis steps", () => {
    expect(niceScale(124000)).toEqual({ max: 150000, step: 50000 });
    expect(niceScale(0)).toEqual({ max: 1000, step: 250 });
  });
  it("formats compact Indian amounts", () => {
    expect(compactINR(50000)).toBe("₹50K");
    expect(compactINR(150000)).toBe("₹1.5L");
    expect(compactINR(25000000)).toBe("₹2.5Cr");
    expect(compactINR(-48000)).toBe("−₹48K");
  });
});
