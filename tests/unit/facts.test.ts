import { describe, expect, it } from "vitest";
import { normaliseExtraction, quoteAppearsIn, type AIExtraction } from "@/modules/extraction/ai-extraction";
import { formatFactValue, formatINR, validateFactValue } from "@/modules/extraction/fields";
import { currentFacts, decideFact, isDuplicateRepayment, missingInformation } from "@/modules/extraction/merge";
import { looksLikeItHasFacts } from "@/modules/conversation/service";

const NOW = new Date("2026-11-10T12:00:00+05:30");

describe("validateFactValue", () => {
  it("cleans money input (commas, ₹) and rejects zero/negative", () => {
    expect(validateFactValue("principal_amount", "₹1,00,000", NOW)).toEqual({ value: 100000 });
    expect(validateFactValue("principal_amount", 80000.456, NOW)).toEqual({ value: 80000.46 });
    expect(validateFactValue("principal_amount", 0, NOW)).toHaveProperty("error");
    expect(validateFactValue("lender_demand", -5, NOW)).toHaveProperty("error");
    expect(validateFactValue("lender_demand", "abc", NOW)).toHaveProperty("error");
  });

  it("limits rates to (0, 100]", () => {
    expect(validateFactValue("interest_rate", "3%", NOW)).toEqual({ value: 3 });
    expect(validateFactValue("interest_rate", 0, NOW)).toHaveProperty("error");
    expect(validateFactValue("interest_rate", 120, NOW)).toHaveProperty("error");
  });

  it("rejects invalid, ancient and future dates", () => {
    expect(validateFactValue("borrowing_date", "2024-02-29", NOW)).toEqual({ value: "2024-02-29" });
    expect(validateFactValue("borrowing_date", "2023-02-29", NOW)).toHaveProperty("error"); // not a leap year
    expect(validateFactValue("borrowing_date", "1900-01-01", NOW)).toHaveProperty("error");
    expect(validateFactValue("borrowing_date", "2026-11-11", NOW)).toHaveProperty("error"); // tomorrow in IST
    expect(validateFactValue("borrowing_date", "05/03/2024", NOW)).toHaveProperty("error");
  });

  it("accepts only allowed choices", () => {
    expect(validateFactValue("interest_type", "compound", NOW)).toEqual({ value: "compound" });
    expect(validateFactValue("interest_type", "unknown", NOW)).toHaveProperty("error");
    expect(validateFactValue("rate_period", "weekly", NOW)).toHaveProperty("error");
  });

  it("months must be whole numbers 1–600", () => {
    expect(validateFactValue("tenure_months", "12", NOW)).toEqual({ value: 12 });
    expect(validateFactValue("tenure_months", 1.5, NOW)).toHaveProperty("error");
  });
});

describe("formatting (Indian conventions)", () => {
  it("formats rupees with lakh grouping", () => {
    expect(formatINR(100000)).toBe("₹1,00,000");
    expect(formatINR(1234567.5)).toBe("₹12,34,567.5");
  });
  it("formats approximate dates as month + year", () => {
    expect(formatFactValue("borrowing_date", "2024-03-01", true)).toBe("around March 2024");
    expect(formatFactValue("rate_period", "monthly")).toBe("Month");
  });
});

const fact = (over: Partial<AIExtraction["facts"][number]>): AIExtraction["facts"][number] => ({
  field: "principal_amount", number: null, text: null, date: null, approximate: false, unknown: false,
  certainty: "explicit", quote: "q", ...over,
});

describe("normaliseExtraction — AI output is validated, never trusted", () => {
  it("keeps valid facts with confidence from certainty", () => {
    const out = normaliseExtraction({
      facts: [
        fact({ field: "principal_amount", number: 80000 }),
        fact({ field: "interest_rate", number: 3, certainty: "interpreted" }),
        fact({ field: "rate_period", text: "monthly" }),
      ],
      repayments: [], charges: [],
    }, undefined, NOW);
    expect(out.facts).toEqual([
      { field: "principal_amount", kind: "value", value: 80000, approximate: false, confidence: 0.9, quote: "q" },
      { field: "interest_rate", kind: "value", value: 3, approximate: false, confidence: 0.7, quote: "q" },
      { field: "rate_period", kind: "value", value: "monthly", approximate: false, confidence: 0.9, quote: "q" },
    ]);
  });

  it("drops invalid values, unknown fields, duplicates and 'unknown' placeholders", () => {
    const out = normaliseExtraction({
      facts: [
        fact({ field: "principal_amount", number: -100 }),
        fact({ field: "not_a_field", number: 5 }),
        fact({ field: "lender_demand", number: 95000 }),
        fact({ field: "lender_demand", number: 99999 }),
        fact({ field: "interest_type", text: "unknown", quote: "it is simple I think" }),
        fact({ field: "borrowing_date", date: "2030-01-01" }),
      ],
      repayments: [], charges: [],
    }, undefined, NOW);
    expect(out.facts.map((f) => f.field)).toEqual(["lender_demand"]);
  });

  it("treats 'unknown' as don't-know only when the borrower's words say so", () => {
    const out = normaliseExtraction({
      facts: [
        fact({ field: "interest_type", text: "unknown", quote: "I don't know if it is simple or compound" }),
        fact({ field: "interest_method", unknown: true, quote: "not sure" }),
      ],
      repayments: [], charges: [],
    }, undefined, NOW);
    expect(out.facts).toEqual([
      { field: "interest_type", kind: "unknown", quote: "I don't know if it is simple or compound" },
      { field: "interest_method", kind: "unknown", quote: "not sure" },
    ]);
  });

  it("ignores 'unknown' for fields the borrower never talked about", () => {
    const out = normaliseExtraction({
      facts: [
        fact({ field: "interest_type", unknown: true, quote: "He charges 3 rupees per hundred every month" }),
        fact({ field: "interest_method", text: "unknown", quote: "I borrowed ₹80,000" }),
      ],
      repayments: [], charges: [],
    }, undefined, NOW);
    expect(out.facts).toEqual([]);
  });

  it("rejects invented quotes: a fabricated 'don't know' is dropped, a value keeps no quote", () => {
    const message = "I borrowed ₹80,000. He charges 3 rupees per hundred every month.";
    const out = normaliseExtraction({
      facts: [
        fact({ field: "interest_type", unknown: true, quote: "I don't know if it is simple or compound" }),
        fact({ field: "principal_amount", number: 80000, quote: "I borrowed ₹80,000" }),
        fact({ field: "interest_rate", number: 3, quote: "the rate is three percent" }),
      ],
      repayments: [], charges: [],
    }, message, NOW);
    expect(out.facts).toEqual([
      { field: "principal_amount", kind: "value", value: 80000, approximate: false, confidence: 0.9, quote: "I borrowed ₹80,000" },
      { field: "interest_rate", kind: "value", value: 3, approximate: false, confidence: 0.9, quote: "" },
    ]);
  });

  it("validates repayments and charges", () => {
    const out = normaliseExtraction({
      facts: [],
      repayments: [
        { amount: 10000, date: "2024-04-05", approximate_date: false, method: "upi", quote: "a" },
        { amount: 0, date: null, approximate_date: false, method: "cash", quote: "b" },
        { amount: 5000, date: "2099-01-01", approximate_date: false, method: "cash", quote: "c" },
        { amount: 2000, date: null, approximate_date: false, method: "bitcoin", quote: "d" },
      ],
      charges: [{ amount: null, date: null, charge_type: "penalty", has_written_basis: "maybe", description: "late", quote: "e" }],
    }, undefined, NOW);
    expect(out.repayments.map((r) => [r.amount, r.date, r.method])).toEqual([[10000, "2024-04-05", "upi"], [2000, null, "unknown"]]);
    expect(out.charges).toEqual([{ amount: null, date: null, chargeType: "penalty", hasWrittenBasis: "unknown", description: "late", quote: "e" }]);
  });
});

describe("decideFact — a confirmed value is never silently replaced", () => {
  it("new field -> unverified; same value -> skip", () => {
    expect(decideFact(null, { kind: "value", value: 80000 })).toBe("unverified");
    expect(decideFact({ value: 80000, status: "unverified" }, { kind: "value", value: 80000 })).toBe("skip");
  });
  it("different value vs unverified -> unverified (newer statement)", () => {
    expect(decideFact({ value: 80000, status: "unverified" }, { kind: "value", value: 85000 })).toBe("unverified");
  });
  it("different value vs confirmed/corrected -> disputed", () => {
    expect(decideFact({ value: 80000, status: "confirmed" }, { kind: "value", value: 85000 })).toBe("disputed");
    expect(decideFact({ value: "simple", status: "corrected" }, { kind: "value", value: "compound" })).toBe("disputed");
  });
  it("'don't know' never overwrites a known or confirmed value", () => {
    expect(decideFact(null, { kind: "unknown" })).toBe("missing");
    expect(decideFact({ value: 3, status: "confirmed" }, { kind: "unknown" })).toBe("skip");
    expect(decideFact({ value: null, status: "missing" }, { kind: "unknown" })).toBe("skip");
  });
  it("a value after 'don't know' is recorded", () => {
    expect(decideFact({ value: null, status: "missing" }, { kind: "value", value: "simple" })).toBe("unverified");
  });
});

describe("currentFacts", () => {
  const row = (field: string, value: number | null, status: string, t: string) => ({
    field_name: field, extracted_value: { value }, verification_status: status as never, source_type: "user_statement" as const,
    confidence: 0.9, created_at: t,
  });
  it("takes the latest row per field and remembers the confirmed value behind a dispute", () => {
    const facts = currentFacts([
      row("principal_amount", 85000, "disputed", "2026-01-03"),
      row("principal_amount", 80000, "confirmed", "2026-01-02"),
      row("principal_amount", 70000, "unverified", "2026-01-01"),
      row("bogus", 1, "unverified", "2026-01-01"),
    ]);
    expect(facts.principal_amount).toMatchObject({ value: 85000, status: "disputed", previousConfirmed: 80000 });
    expect(Object.keys(facts)).toEqual(["principal_amount"]);
  });
});

describe("repayment de-duplication", () => {
  it("same amount and date is a duplicate", () => {
    const existing = [{ amount: 10000, date: "2024-04-05" }, { amount: 5000, date: null }];
    expect(isDuplicateRepayment(existing, { amount: 10000, date: "2024-04-05" })).toBe(true);
    expect(isDuplicateRepayment(existing, { amount: 5000, date: null })).toBe(true);
    expect(isDuplicateRepayment(existing, { amount: 10000, date: "2024-05-05" })).toBe(false);
  });
});

describe("missingInformation", () => {
  const f = (value: number | string | null, status = "unverified") => ({ value, status }) as never;
  it("lists what's needed for calculation; compounding only if compound", () => {
    const m1 = missingInformation({ principal_amount: f(80000), interest_type: f("simple") }, 0);
    const req = m1.filter((x) => x.required).map((x) => x.key);
    expect(req).toEqual(expect.arrayContaining(["borrowing_date", "interest_rate", "rate_period", "lender_demand", "repayments"]));
    expect(req).not.toContain("principal_amount");
    expect(m1.map((x) => x.key)).not.toContain("compounding_frequency");

    const m2 = missingInformation({ interest_type: f("compound") }, 0);
    expect(m2.find((x) => x.key === "compounding_frequency")?.required).toBe(true);
  });
  it("a reported total makes individual repayments 'helpful' rather than 'needed'", () => {
    const m = missingInformation({ total_repaid_reported: f(70000) }, 0);
    expect(m.find((x) => x.key === "repayments")?.required).toBe(false);
  });
  it("'don't know' still counts as missing", () => {
    const m = missingInformation({ interest_type: f(null, "missing") }, 0);
    expect(m.map((x) => x.key)).toContain("interest_type");
  });
});

describe("looksLikeItHasFacts (triggers the second extraction pass)", () => {
  it.each(["I borrowed 80,000", "3 rupees per hundred", "paid in March", "I don't know the rate", "₹500", "2 lakh"])("yes: %s", (t) => {
    expect(looksLikeItHasFacts(t)).toBe(true);
  });
  it.each(["Yes", "Thank you", "He is my neighbour", "I am safe now"])("no: %s", (t) => {
    expect(looksLikeItHasFacts(t)).toBe(false);
  });
});

describe("quoteAppearsIn", () => {
  it("matches despite case, curly quotes and spacing", () => {
    expect(quoteAppearsIn("i DON’T know", "Honestly I don't  know the rate.")).toBe(true);
    expect(quoteAppearsIn("paid ₹10,000 by UPI.", "I paid ₹10,000 by UPI on 5 April")).toBe(true);
  });
  it("rejects words not in the message", () => {
    expect(quoteAppearsIn("I don't know if it is simple or compound", "I borrowed ₹80,000")).toBe(false);
    expect(quoteAppearsIn("", "anything")).toBe(false);
  });
});

describe("relative dates and received amounts (raw-output findings)", () => {
  const now = new Date("2026-11-11T12:00:00+05:30");
  it("computes 'N months ago' in code, from today", async () => {
    const { relativeDateFromText } = await import("@/modules/extraction/ai-extraction");
    expect(relativeDateFromText("around 10 months ago", now)).toBe("2026-01-01");
    expect(relativeDateFromText("about 4 months ago", now)).toBe("2026-07-01");
    expect(relativeDateFromText("two years ago", now)).toBe("2024-11-01");
    expect(relativeDateFromText("3 weeks ago", now)).toBe("2026-10-21");
    expect(relativeDateFromText("in March", now)).toBeNull();
  });
  it("overrides a wrong year from the AI, and drops an invented 'amount actually received'", () => {
    const raw = {
      facts: [
        { field: "borrowing_date", number: null, text: null, date: "2024-01-01", approximate: true, unknown: false, certainty: "interpreted" as const, quote: "around 10 months ago" },
        { field: "amount_actually_received", number: 100000, text: null, date: null, approximate: false, unknown: false, certainty: "explicit" as const, quote: "I borrowed ₹1,00,000" },
      ],
      repayments: [],
      charges: [],
    };
    const out = normaliseExtraction(raw, "I borrowed ₹1,00,000 around 10 months ago", now);
    expect(out.facts).toEqual([{ field: "borrowing_date", kind: "value", value: "2026-01-01", approximate: true, confidence: 0.7, quote: "around 10 months ago" }]);
  });
});
