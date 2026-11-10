import { describe, expect, it } from "vitest";
import { createCaseSchema, defaultCaseTitle, updateCaseSchema } from "@/lib/validation/cases";

describe("createCaseSchema", () => {
  it("accepts the minimum (state + lender type) and treats blank fields as not provided", () => {
    const r = createCaseSchema.safeParse({ case_title: "  ", state: "TG", lender_type: "individual", problem_description: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.case_title).toBeUndefined();
      expect(r.data.problem_description).toBeUndefined();
    }
  });

  it("requires a supported state and lender type", () => {
    expect(createCaseSchema.safeParse({ lender_type: "individual" }).success).toBe(false);
    expect(createCaseSchema.safeParse({ state: "KA", lender_type: "individual" }).success).toBe(false);
    expect(createCaseSchema.safeParse({ state: "AP", lender_type: "bank" }).success).toBe(false);
  });

  it("limits title and description length", () => {
    expect(createCaseSchema.safeParse({ state: "AP", lender_type: "unsure", case_title: "x".repeat(121) }).success).toBe(false);
    expect(createCaseSchema.safeParse({ state: "AP", lender_type: "unsure", problem_description: "x".repeat(4001) }).success).toBe(false);
  });
});

describe("updateCaseSchema", () => {
  it("accepts partial updates", () => {
    expect(updateCaseSchema.safeParse({ case_title: "New name" }).success).toBe(true);
    expect(updateCaseSchema.safeParse({ closed: true }).success).toBe(true);
  });

  it("rejects empty updates and unknown fields (e.g. trying to set user_id or status directly)", () => {
    expect(updateCaseSchema.safeParse({}).success).toBe(false);
    expect(updateCaseSchema.safeParse({ user_id: "x" }).success).toBe(false);
    expect(updateCaseSchema.safeParse({ case_status: "analysed" }).success).toBe(false);
  });

  it("clearing the description stores null", () => {
    const r = updateCaseSchema.safeParse({ problem_description: "   " });
    expect(r.success && r.data.problem_description).toBe(null);
  });
});

it("defaultCaseTitle includes the date", () => {
  expect(defaultCaseTitle(new Date("2026-11-10T10:00:00Z"))).toMatch(/^Loan dispute – 10 Nov 2026$/);
});
