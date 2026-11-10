import { describe, expect, it } from "vitest";
import { normaliseDocumentReading, HANDWRITTEN_MAX_CONFIDENCE, type AIDocumentReading } from "@/modules/documents/ai-reading";
import { buildChecklist, describeEvidence, evidenceCovers } from "@/modules/documents/evidence";
import { checkUpload, MAX_UPLOAD_BYTES, sanitizeFilename, sniffMimeType } from "@/modules/documents/file-checks";
import { normaliseExtraction } from "@/modules/extraction/ai-extraction";

const NOW = new Date("2026-11-11T12:00:00+05:30");
const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0]);

describe("file checks", () => {
  it("detects PDF, JPEG and PNG from the first bytes", () => {
    expect(sniffMimeType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("application/pdf");
    expect(sniffMimeType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
  });

  it("rejects other files whatever their name, and empty or oversized files", () => {
    expect(sniffMimeType(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(sniffMimeType(bytes(0x4d, 0x5a))).toBeNull(); // .exe
    expect(sniffMimeType(bytes(0x47, 0x49, 0x46, 0x38))).toBeNull(); // GIF
    expect(checkUpload(new Uint8Array())).toEqual({ ok: false, error: "The file is empty." });
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(checkUpload(big).ok).toBe(false);
    expect(checkUpload(bytes(0xff, 0xd8, 0xff))).toEqual({ ok: true, mimeType: "image/jpeg", extension: "jpg" });
  });

  it("makes file names safe", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\me\\loan note.pdf")).toBe("loan note.pdf");
    expect(sanitizeFilename("a<b>c:d|e?.png")).toBe("abcde.png");
    expect(sanitizeFilename("   ")).toBe("document");
    expect(sanitizeFilename(".hidden")).toBe("hidden");
    const long = sanitizeFilename(`${"x".repeat(300)}.pdf`);
    expect(long.length).toBe(120);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});

describe("evidence checklist", () => {
  const doc = (over: Partial<{ id: string; document_type: string; extraction_status: string; evidence_covers: string[] }>) => ({
    id: "d1",
    original_filename: "note.pdf",
    document_type: "promissory_note",
    extraction_status: "completed",
    evidence_covers: [],
    ...over,
  });

  it("combines the document type's default with what the AI reports, ignoring unknown keys", () => {
    expect(evidenceCovers("promissory_note", ["money_received", "nonsense"])).toEqual(["loan_agreement", "money_received"]);
    expect(evidenceCovers("other", [])).toEqual([]);
  });

  it("marks items from documents; review-needed documents show 'check'", () => {
    const list = buildChecklist([doc({}), doc({ id: "d2", document_type: "receipt", extraction_status: "needs_review" })], []);
    const by = Object.fromEntries(list.map((i) => [i.key, i]));
    expect(by.loan_agreement.status).toBe("uploaded");
    expect(by.loan_agreement.limitation).toBeNull();
    expect(by.repayment_records.status).toBe("check");
    expect(by.lender_demand.status).toBe("not_checked");
    expect(by.lender_demand.limitation).toMatch(/demanded amount/);
  });

  it("records the borrower's answers and explains limitations without blocking", () => {
    const list = buildChecklist([], [
      { evidence_type: "loan_agreement", status: "missing" },
      { evidence_type: "bank_statements", status: "not_applicable" },
      { evidence_type: "repayment_records", status: "partial" },
    ]);
    const by = Object.fromEntries(list.map((i) => [i.key, i]));
    expect(by.loan_agreement.status).toBe("dont_have");
    expect(by.loan_agreement.limitation).toBeTruthy();
    expect(by.bank_statements.status).toBe("not_applicable");
    expect(by.bank_statements.limitation).toBeNull();
    expect(by.repayment_records.status).toBe("partial");
  });

  it("tells the chat what is uploaded and what the borrower doesn't have", () => {
    const list = buildChecklist([doc({})], [{ evidence_type: "lender_demand", status: "missing" }]);
    const text = describeEvidence(list, [doc({})]);
    expect(text).toContain("Documents uploaded (1): promissory note");
    expect(text).toContain("do not have: lender's written demand");
  });
});

describe("strict (document) extraction", () => {
  const raw = {
    facts: [
      { field: "principal_amount", number: 80000, text: null, date: null, approximate: false, unknown: false, certainty: "explicit" as const, quote: "Rs. 80,000" },
      { field: "interest_rate", number: 3, text: null, date: null, approximate: false, unknown: false, certainty: "explicit" as const, quote: "invented quote" },
      { field: "lender_demand", number: null, text: null, date: null, approximate: false, unknown: true, certainty: "explicit" as const, quote: "I don't know" },
      { field: "documents_mentioned", number: null, text: "receipt", date: null, approximate: false, unknown: false, certainty: "explicit" as const, quote: "Rs. 80,000" },
    ],
    repayments: [
      { amount: 10000, date: "2025-01-05", approximate_date: false, method: "cash", quote: "paid Rs. 10,000 on 05/01/2025" },
      { amount: 5000, date: null, approximate_date: false, method: "cash", quote: "not in the text" },
    ],
    charges: [],
  };
  const text = "I received Rs. 80,000. paid Rs. 10,000 on 05/01/2025. I don't know";

  it("drops items whose quote is not in the text, 'unknown' facts and excluded fields", () => {
    const out = normaliseExtraction(raw, text, NOW, { requireQuote: true, allowUnknown: false, excludeFields: ["documents_mentioned"] });
    expect(out.facts.map((f) => f.field)).toEqual(["principal_amount"]);
    expect(out.repayments).toHaveLength(1);
    expect(out.repayments[0].amount).toBe(10000);
  });

  it("keeps chat behaviour unchanged by default", () => {
    const out = normaliseExtraction(raw, text, NOW);
    expect(out.facts.map((f) => f.field).sort()).toEqual(["documents_mentioned", "interest_rate", "lender_demand", "principal_amount"]);
    expect(out.repayments).toHaveLength(2);
  });
});

describe("normaliseDocumentReading", () => {
  const base: AIDocumentReading = {
    transcript: "PROMISSORY NOTE. I, Ravi, received Rs. 80,000 from Suresh at 3% per month. Aadhaar 1234 5678 9012.",
    document_type: "promissory_note",
    handwritten: false,
    legibility: "clear",
    summary: "Promissory note for Rs. 80,000",
    evidence_covers: ["money_received"],
    is_loan_related: true,
    facts: [
      { field: "principal_amount", number: 80000, text: null, date: null, approximate: false, unknown: false, certainty: "explicit", quote: "received Rs. 80,000" },
      { field: "interest_rate", number: 3, text: null, date: null, approximate: false, unknown: false, certainty: "explicit", quote: "3% per month" },
    ],
    repayments: [],
    charges: [],
  };

  it("removes ID numbers from the transcript and keeps quoted facts", () => {
    const r = normaliseDocumentReading(base, NOW);
    expect(r.transcript).not.toContain("1234 5678 9012");
    expect(r.transcript).toContain("[removed]");
    expect(r.status).toBe("completed");
    expect(r.documentType).toBe("promissory_note");
    expect(r.evidenceCovers).toEqual(["loan_agreement", "money_received"]);
    expect(r.extraction.facts).toHaveLength(2);
  });

  it("handwritten documents always need review and get low confidence", () => {
    const r = normaliseDocumentReading({ ...base, handwritten: true }, NOW);
    expect(r.status).toBe("needs_review");
    expect(r.notes.join(" ")).toMatch(/Handwritten/);
    for (const f of r.extraction.facts) if (f.kind === "value") expect(f.confidence).toBeLessThanOrEqual(HANDWRITTEN_MAX_CONFIDENCE);
  });

  it("hard-to-read documents need review", () => {
    expect(normaliseDocumentReading({ ...base, legibility: "partly_legible" }, NOW).status).toBe("needs_review");
    expect(normaliseDocumentReading({ ...base, legibility: "blurry?" }, NOW).legibility).toBe("partly_legible");
  });

  it("takes nothing from unrelated documents", () => {
    const r = normaliseDocumentReading({ ...base, is_loan_related: false }, NOW);
    expect(r.extraction.facts).toHaveLength(0);
    expect(r.evidenceCovers).toEqual([]);
    expect(r.status).toBe("needs_review");
  });

  it("falls back to 'other' for an unknown document type", () => {
    expect(normaliseDocumentReading({ ...base, document_type: "passport" }, NOW).documentType).toBe("other");
  });
});
