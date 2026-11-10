/**
 * The single source of truth for loan facts: type, allowed values,
 * validation and display. Used by AI extraction, editing forms and the summary.
 * No server-only imports — safe for client components.
 */

export type FieldKind = "money" | "percent" | "date" | "months" | "enum" | "text";

type Option = { value: string; label: string };

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  help?: string;
  options?: Option[];
  /** Needed before a balance can be calculated. */
  requiredForCalculation?: boolean;
};

export const FACT_FIELDS = [
  { key: "principal_amount", label: "Amount borrowed (principal)", kind: "money", requiredForCalculation: true },
  { key: "amount_actually_received", label: "Amount actually received", kind: "money", help: "If interest or fees were deducted at the start." },
  { key: "borrowing_date", label: "Date borrowed", kind: "date", requiredForCalculation: true },
  { key: "interest_rate", label: "Interest rate (%)", kind: "percent", requiredForCalculation: true, help: "\"2 rupees per hundred per month\" = 2% per month." },
  {
    key: "rate_period", label: "Rate is per", kind: "enum", requiredForCalculation: true,
    options: [{ value: "monthly", label: "Month" }, { value: "annual", label: "Year" }],
  },
  {
    key: "interest_type", label: "Simple or compound", kind: "enum", requiredForCalculation: true,
    help: "Compound = interest is also charged on unpaid interest.",
    options: [{ value: "simple", label: "Simple" }, { value: "compound", label: "Compound" }],
  },
  {
    key: "interest_method", label: "Flat or reducing balance", kind: "enum",
    help: "Flat = interest always on the original amount. Reducing = interest only on what is still owed.",
    options: [{ value: "flat", label: "Flat" }, { value: "reducing", label: "Reducing balance" }],
  },
  {
    key: "compounding_frequency", label: "Compounded every", kind: "enum",
    options: [
      { value: "monthly", label: "Month" }, { value: "quarterly", label: "Quarter" },
      { value: "half_yearly", label: "Half-year" }, { value: "annually", label: "Year" },
    ],
  },
  { key: "tenure_months", label: "Loan period (months)", kind: "months" },
  {
    key: "repayment_frequency", label: "Repayment schedule", kind: "enum",
    options: [
      { value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" },
      { value: "lump_sum", label: "One lump sum" }, { value: "irregular", label: "No fixed schedule" },
    ],
  },
  { key: "total_repaid_reported", label: "Total repaid so far (as reported)", kind: "money", help: "Used when individual payments aren't listed." },
  { key: "lender_demand", label: "Lender's current demand", kind: "money", requiredForCalculation: true },
  { key: "lender_demand_date", label: "Date of the demand", kind: "date" },
  {
    key: "repayment_allocation", label: "How payments were applied", kind: "enum",
    options: [
      { value: "interest_first", label: "Interest first, then principal" },
      { value: "principal_first", label: "Principal first" },
      { value: "charges_interest_principal", label: "Charges, then interest, then principal" },
    ],
  },
  { key: "documents_mentioned", label: "Documents you have", kind: "text" },
] as const satisfies readonly FieldDef[];

export type FactField = (typeof FACT_FIELDS)[number]["key"];
export const FACT_FIELD_KEYS = FACT_FIELDS.map((f) => f.key) as [FactField, ...FactField[]];
export const FIELD_BY_KEY: Record<FactField, FieldDef> = Object.fromEntries(FACT_FIELDS.map((f) => [f.key, f])) as Record<FactField, FieldDef>;

export function isFactField(key: string): key is FactField {
  return key in FIELD_BY_KEY;
}

export type FactValue = number | string;

const MIN_DATE = "1950-01-01";

/** Today's date in India (YYYY-MM-DD). */
export function todayIST(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Validates and normalises a value for a field. Returns the clean value or an
 * error message. Used for both AI output and user input — the same rules apply.
 */
export function validateFactValue(field: FactField, raw: unknown, now = new Date()): { value: FactValue } | { error: string } {
  const def = FIELD_BY_KEY[field];
  switch (def.kind) {
    case "money": {
      const n = typeof raw === "string" ? Number(raw.replace(/[,₹\s]/g, "")) : raw;
      if (typeof n !== "number" || !Number.isFinite(n)) return { error: "Enter an amount in rupees." };
      if (n <= 0) return { error: "Amount must be more than zero." };
      if (n > 10_000_000_000) return { error: "That amount looks too large." };
      return { value: Math.round(n * 100) / 100 };
    }
    case "percent": {
      const n = typeof raw === "string" ? Number(raw.replace(/[%\s]/g, "")) : raw;
      if (typeof n !== "number" || !Number.isFinite(n)) return { error: "Enter the rate as a number, e.g. 3." };
      if (n <= 0 || n > 100) return { error: "Rate must be between 0 and 100." };
      return { value: Math.round(n * 10000) / 10000 };
    }
    case "months": {
      const n = typeof raw === "string" ? Number(raw.trim()) : raw;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 600) return { error: "Enter a whole number of months (1–600)." };
      return { value: n };
    }
    case "date": {
      if (typeof raw !== "string" || !isValidISODate(raw)) return { error: "Enter a valid date." };
      if (raw < MIN_DATE) return { error: "That date is too far in the past." };
      if (raw > todayIST(now)) return { error: "The date can't be in the future." };
      return { value: raw };
    }
    case "enum": {
      if (typeof raw !== "string" || !def.options?.some((o) => o.value === raw)) return { error: "Choose one of the options." };
      return { value: raw };
    }
    case "text": {
      if (typeof raw !== "string") return { error: "Enter some text." };
      const t = raw.trim().replace(/\s+/g, " ");
      if (!t) return { error: "Enter some text." };
      if (t.length > 300) return { error: "Keep this under 300 characters." };
      return { value: t };
    }
  }
}

export function valuesEqual(a: FactValue | null | undefined, b: FactValue | null | undefined): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.005;
  if (typeof a === "string" && typeof b === "string") return a.trim().toLowerCase() === b.trim().toLowerCase();
  return a == null && b == null;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });

export function formatINR(n: number): string {
  return inr.format(n);
}

export function formatISODate(iso: string, approximate = false): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = approximate
    ? { month: "long", year: "numeric", timeZone: "UTC" }
    : { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" };
  return (approximate ? "around " : "") + d.toLocaleDateString("en-IN", opts);
}

/** Human-readable value for display. */
export function formatFactValue(field: FactField, value: FactValue, approximate = false): string {
  const def = FIELD_BY_KEY[field];
  switch (def.kind) {
    case "money":
      return formatINR(value as number);
    case "percent":
      return `${value}%`;
    case "months":
      return `${value} month${value === 1 ? "" : "s"}`;
    case "date":
      return formatISODate(value as string, approximate);
    case "enum":
      return def.options?.find((o) => o.value === value)?.label ?? String(value);
    case "text":
      return String(value);
  }
}

// ---------------------------------------------------------------- repayments & charges

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" }, { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" }, { value: "cheque", label: "Cheque" },
  { value: "in_kind", label: "In kind (goods/work)" }, { value: "other", label: "Other" },
  { value: "unknown", label: "Not sure" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export const CHARGE_TYPES = [
  { value: "penalty", label: "Penalty" }, { value: "late_fee", label: "Late fee" },
  { value: "processing_fee", label: "Processing fee" }, { value: "other", label: "Other" },
  { value: "unknown", label: "Not sure" },
] as const;
export type ChargeType = (typeof CHARGE_TYPES)[number]["value"];

export const WRITTEN_BASIS = [
  { value: "yes", label: "Yes, in writing" }, { value: "no", label: "No" }, { value: "unknown", label: "Not sure" },
] as const;
export type WrittenBasis = (typeof WRITTEN_BASIS)[number]["value"];

export function labelOf(list: readonly { value: string; label: string }[], v: string) {
  return list.find((o) => o.value === v)?.label ?? v;
}
