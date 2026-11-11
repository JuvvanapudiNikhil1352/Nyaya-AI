import { z } from "zod";
import {
  CHARGE_TYPES,
  FACT_FIELD_KEYS,
  FIELD_BY_KEY,
  PAYMENT_METHODS,
  validateFactValue,
  WRITTEN_BASIS,
  type ChargeType,
  type FactField,
  type FactValue,
  type PaymentMethod,
  type WrittenBasis,
} from "./fields";

/**
 * What the AI returns about the borrower's LATEST message, alongside its reply.
 * Kept flat and small (strict JSON schema; free-tier token limits).
 */
export const EXTRACTION_JSON_SCHEMA = {
  facts: {
    type: "array",
    description: "Loan facts stated in the borrower's latest message only.",
    items: {
      type: "object",
      properties: {
        field: { type: "string", enum: FACT_FIELD_KEYS },
        number: { type: ["number", "null"], description: "For amounts, rates and months. Rupees as plain numbers." },
        text: { type: ["string", "null"], description: "For choice fields use the allowed value; for documents_mentioned a short list." },
        date: { type: ["string", "null"], description: "YYYY-MM-DD. If only month/year known, use the 1st and set approximate." },
        approximate: { type: "boolean" },
        unknown: { type: "boolean", description: "True if the borrower says they do not know this." },
        certainty: { type: "string", enum: ["explicit", "interpreted", "uncertain"] },
        quote: { type: "string", description: "The borrower's exact words this came from (short)." },
      },
      required: ["field", "number", "text", "date", "approximate", "unknown", "certainty", "quote"],
      additionalProperties: false,
    },
  },
  repayments: {
    type: "array",
    description: "Individual repayments described in the latest message (not a total).",
    items: {
      type: "object",
      properties: {
        amount: { type: "number" },
        date: { type: ["string", "null"] },
        approximate_date: { type: "boolean" },
        method: { type: "string", enum: PAYMENT_METHODS.map((m) => m.value) },
        quote: { type: "string" },
      },
      required: ["amount", "date", "approximate_date", "method", "quote"],
      additionalProperties: false,
    },
  },
  charges: {
    type: "array",
    description: "Extra charges or penalties the lender added, from the latest message.",
    items: {
      type: "object",
      properties: {
        amount: { type: ["number", "null"] },
        date: { type: ["string", "null"] },
        charge_type: { type: "string", enum: CHARGE_TYPES.map((c) => c.value) },
        has_written_basis: { type: "string", enum: WRITTEN_BASIS.map((w) => w.value) },
        description: { type: "string" },
        quote: { type: "string" },
      },
      required: ["amount", "date", "charge_type", "has_written_basis", "description", "quote"],
      additionalProperties: false,
    },
  },
} as const;

const aiFact = z.object({
  field: z.string(),
  number: z.number().nullable(),
  text: z.string().nullable(),
  date: z.string().nullable(),
  approximate: z.boolean(),
  unknown: z.boolean(),
  certainty: z.enum(["explicit", "interpreted", "uncertain"]),
  quote: z.string(),
});
const aiRepayment = z.object({
  amount: z.number(),
  date: z.string().nullable(),
  approximate_date: z.boolean(),
  method: z.string(),
  quote: z.string(),
});
const aiCharge = z.object({
  amount: z.number().nullable(),
  date: z.string().nullable(),
  charge_type: z.string(),
  has_written_basis: z.string(),
  description: z.string(),
  quote: z.string(),
});

/** Lenient on items (bad items are dropped later), strict on overall shape. */
export const aiExtractionSchema = z.object({
  facts: z.array(aiFact).max(30),
  repayments: z.array(aiRepayment).max(50),
  charges: z.array(aiCharge).max(20),
});
export type AIExtraction = z.infer<typeof aiExtractionSchema>;

// ---------------------------------------------------------------- normalised

export type ExtractedFact =
  | { field: FactField; kind: "value"; value: FactValue; approximate: boolean; confidence: number; quote: string }
  | { field: FactField; kind: "unknown"; quote: string };

export type ExtractedRepayment = {
  amount: number;
  date: string | null;
  approximate: boolean;
  method: PaymentMethod;
  quote: string;
};

export type ExtractedCharge = {
  amount: number | null;
  date: string | null;
  chargeType: ChargeType;
  hasWrittenBasis: WrittenBasis;
  description: string;
  quote: string;
};

const CONFIDENCE = { explicit: 0.9, interpreted: 0.7, uncertain: 0.4 } as const;

const clip = (s: string, n: number) => s.trim().replace(/\s+/g, " ").slice(0, n);

const normForMatch = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}₹%'.,]+/gu, " ")
    .trim();

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, eighteen: 18, "a couple of": 2, "a few": 3,
};

/**
 * Date for phrases like "about 10 months ago", "2 years ago", "3 weeks ago",
 * computed from today in code (models often guess the wrong year).
 * Months/years → 1st of that month. Returns null if the text has no such phrase.
 */
export function relativeDateFromText(text: string, now = new Date()): string | null {
  const m = text.toLowerCase().match(/\b(\d{1,2}|a couple of|a few|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen)\s+(weeks?|months?|years?)\s+(ago|back)\b/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
  if (!n) return null;
  const today = new Date(`${now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}T00:00:00Z`);
  if (m[2].startsWith("week")) return new Date(today.getTime() - n * 7 * 86_400_000).toISOString().slice(0, 10);
  const months = m[2].startsWith("year") ? n * 12 : n;
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, 1));
  return d.toISOString().slice(0, 10);
}

const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/** True if the (normalised) quote occurs in the (normalised) message. */
export function quoteAppearsIn(quote: string, message: string): boolean {
  const q = normForMatch(quote).replace(/^[.,]+|[.,]+$/g, "").trim();
  return q.length > 0 && normForMatch(message).includes(q);
}

/**
 * Converts raw AI output into validated facts. Anything that fails the same
 * validation rules used for user input is DROPPED, never "fixed" by guessing.
 */
export type NormaliseOptions = {
  /** Drop any item whose quote is not found in the source text (used for documents). */
  requireQuote?: boolean;
  /** Accept "borrower doesn't know" facts (chat only; a document can't say that). */
  allowUnknown?: boolean;
  /** Fields to ignore. */
  excludeFields?: FactField[];
};

export function normaliseExtraction(
  raw: AIExtraction,
  sourceText?: string,
  now = new Date(),
  { requireQuote = false, allowUnknown = true, excludeFields = [] }: NormaliseOptions = {},
) {
  // A quote is only kept if it really appears in the borrower's message —
  // models sometimes invent or copy quotes from their instructions.
  const verify = (q: string) => (sourceText === undefined || quoteAppearsIn(q, sourceText) ? clip(q, 300) : "");
  // In strict mode an item without a verified quote is dropped entirely.
  const rejected = (quote: string) => requireQuote && quote === "";
  const facts: ExtractedFact[] = [];
  const seen = new Set<string>();
  for (const f of raw.facts) {
    if (!(FACT_FIELD_KEYS as string[]).includes(f.field) || seen.has(f.field)) continue;
    const field = f.field as FactField;
    if (excludeFields.includes(field)) continue;
    const quote = verify(f.quote);
    if (rejected(quote)) continue;
    const noValue = f.number === null && f.date === null && (f.text === null || f.text.trim().toLowerCase() === "unknown");
    // "Borrower doesn't know" is accepted ONLY when their own words say so.
    // Otherwise a model could mark never-discussed fields as unknown, and the
    // assistant would stop asking about them.
    const quoteSaysUnknown = /\b(don'?t|do not|didn'?t|did not) know\b|\bnot sure\b|\bno idea\b|\bunsure\b|\bcan'?t remember\b|\bdon'?t remember\b/i.test(quote);
    if ((f.unknown || noValue) && quoteSaysUnknown) {
      if (allowUnknown) {
        facts.push({ field, kind: "unknown", quote });
        seen.add(field);
      }
      continue;
    }
    // "I borrowed ₹X" is the principal, not proof of what was actually received.
    if (field === "amount_actually_received" && !/receiv|got|gave me|given|credited|handed|in hand|deduct|cut|only paid me/i.test(quote || f.quote)) continue;
    let candidate = f.date ?? f.number ?? f.text;
    let approximate = f.approximate;
    // Relative dates ("10 months ago") are computed in code from the borrower's own words.
    const relative = FIELD_BY_KEY[field].kind === "date" && quote ? relativeDateFromText(quote, now) : null;
    if (relative && (typeof candidate !== "string" || daysApart(candidate, relative) > 31)) {
      candidate = relative;
      approximate = true;
    }
    if (candidate === null || candidate === "unknown") continue;
    const checked = validateFactValue(field, candidate, now);
    if ("error" in checked) continue;
    facts.push({
      field,
      kind: "value",
      value: checked.value,
      approximate,
      confidence: CONFIDENCE[f.certainty],
      quote,
    });
    seen.add(field);
  }

  const repayments: ExtractedRepayment[] = [];
  for (const r of raw.repayments) {
    const amount = validateFactValue("principal_amount", r.amount, now);
    if ("error" in amount) continue;
    let date: string | null = null;
    if (r.date) {
      const d = validateFactValue("borrowing_date", r.date, now);
      if ("error" in d) continue;
      date = d.value as string;
    }
    const method = (PAYMENT_METHODS.some((m) => m.value === r.method) ? r.method : "unknown") as PaymentMethod;
    const quote = verify(r.quote);
    if (rejected(quote)) continue;
    repayments.push({ amount: amount.value as number, date, approximate: r.approximate_date, method, quote });
  }

  const charges: ExtractedCharge[] = [];
  for (const c of raw.charges) {
    let amount: number | null = null;
    if (c.amount !== null) {
      const a = validateFactValue("principal_amount", c.amount, now);
      if ("error" in a) continue;
      amount = a.value as number;
    }
    let date: string | null = null;
    if (c.date) {
      const d = validateFactValue("borrowing_date", c.date, now);
      if (!("error" in d)) date = d.value as string;
    }
    const chargeType = (CHARGE_TYPES.some((t) => t.value === c.charge_type) ? c.charge_type : "unknown") as ChargeType;
    const hasWrittenBasis = (WRITTEN_BASIS.some((w) => w.value === c.has_written_basis) ? c.has_written_basis : "unknown") as WrittenBasis;
    const quote = verify(c.quote);
    if (rejected(quote)) continue;
    charges.push({ amount, date, chargeType, hasWrittenBasis, description: clip(c.description, 300), quote });
  }

  return { facts, repayments, charges };
}
