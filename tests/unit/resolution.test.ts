import { describe, expect, it } from "vitest";
import { buildActionPlan, recommend, RESOLUTION_OPTIONS, RESOLUTION_TYPES, type PlanContext } from "@/modules/resolution/plan";

const ctx = (over: Partial<PlanContext> = {}, analysis: Partial<NonNullable<PlanContext["analysis"]>> = {}): PlanContext => ({
  safetyConcern: false,
  analysis: { status: "complete", balance: 58755.38, range: { min: 58755.38, max: 58755.38 }, lenderDemand: 70000, asOfDate: "2025-01-01", totalRepaid: 60000, chargesReviewCount: 0, ...analysis },
  legal: { exists: true, lawyerRecommended: false, notCoveredCount: 0 },
  evidence: [
    { key: "loan_agreement", label: "Loan agreement or promissory note", status: "uploaded" },
    { key: "lender_demand", label: "Lender's written demand", status: "not_checked" },
  ],
  ...over,
});

describe("every option explains what the spec requires", () => {
  it("has what it involves, how we help, benefits, risks and what is needed", () => {
    for (const k of RESOLUTION_TYPES) {
      const o = RESOLUTION_OPTIONS[k];
      expect(o.involves && o.howWeHelp).toBeTruthy();
      expect(o.benefits.length && o.risks.length && o.needed.length).toBeGreaterThan(0);
    }
  });
});

describe("recommend — a sensible starting point, never forced", () => {
  it("demand above the calculation → ask for a written breakdown first, with the gap explained", () => {
    const r = recommend(ctx());
    expect(r.recommended).toBe("clarification");
    expect(r.reasons[0]).toMatch(/₹70,000.*₹11,244\.62 more than our calculation/);
    expect(r.alsoConsider).toContain("negotiation");
  });
  it("demand not above the calculation → negotiation", () => {
    expect(recommend(ctx({}, { lenderDemand: 50000 })).recommended).toBe("negotiation");
  });
  it("unknown terms with the demand inside the range → clarification", () => {
    const r = recommend(ctx({}, { status: "scenarios", balance: null, range: { min: 25030, max: 38800 }, lenderDemand: 30000 }));
    expect(r.recommended).toBe("clarification");
    expect(r.reasons[0]).toMatch(/falls within our range/);
  });
  it("no calculation yet → clarification", () => {
    expect(recommend(ctx({ analysis: null })).recommended).toBe("clarification");
  });
  it("threats override everything: legal assistance first, safety alert shown (spec Test 5)", () => {
    const r = recommend(ctx({ safetyConcern: true }));
    expect(r.recommended).toBe("legal_assistance");
    expect(r.alerts[0]).toMatch(/112/);
  });
  it("always warns about deadlines, and suggests legal help when sources are missing", () => {
    const r = recommend(ctx({ legal: { exists: true, lawyerRecommended: false, notCoveredCount: 2 } }));
    expect(r.alerts.join(" ")).toMatch(/deadline/);
    expect(r.alsoConsider).toContain("legal_assistance");
  });
  it("mentions extra charges that need examining", () => {
    expect(recommend(ctx({}, { chargesReviewCount: 1 })).reasons.join(" ")).toMatch(/1 extra charge needs examining/);
  });
});

describe("buildActionPlan — personalised steps", () => {
  it("clarification uses the real demand and calculation, and lists missing evidence", () => {
    const steps = buildActionPlan("clarification", ctx());
    const text = steps.map((s) => `${s.title} ${s.detail}`).join(" ");
    expect(text).toMatch(/how they reached ₹70,000/);
    expect(text).toMatch(/Our calculation is ₹58,755\.38 on 1 Jan 2025/);
    expect(text).toMatch(/You have: loan agreement or promissory note/);
    expect(text).toMatch(/Look for: lender's written demand/);
    expect(steps.every((s) => s.done === false)).toBe(true);
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
  });
  it("shows the range when terms are unknown", () => {
    const steps = buildActionPlan("negotiation", ctx({}, { status: "scenarios", balance: null, range: { min: 25030.07, max: 38800 } }));
    expect(steps.map((s) => s.detail).join(" ")).toMatch(/between ₹25,030\.07 and ₹38,800/);
  });
  it("puts safety first and adds a police step for legal action when threats were reported", () => {
    const steps = buildActionPlan("legal_action", ctx({ safetyConcern: true }));
    expect(steps[0].id).toBe("safety");
    expect(steps.map((s) => s.id)).toContain("police");
    expect(steps.map((s) => s.id)).toContain("get-advice-first");
  });
  it("legal assistance mentions gaps in our sources when there are any", () => {
    const steps = buildActionPlan("legal_assistance", ctx({ legal: { exists: true, lawyerRecommended: true, notCoveredCount: 1 } }));
    expect(steps.find((s) => s.id === "questions")!.detail).toMatch(/not covered by Nyaya AI's sources/);
  });
});
