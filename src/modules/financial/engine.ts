import { addMonths, calendarMonths, daysBetween, days30360 } from "./dates";

/**
 * Nyaya AI loan calculation engine. Pure and deterministic: the same inputs
 * always give the same result. No AI is involved in any arithmetic.
 *
 * How it works: interest is accrued between dated events (repayments, charges,
 * compounding dates, the calculation date). Each accrual is rounded to the
 * paisa. Repayments are applied in the agreed order. When a loan term is
 * unknown, every possible method is calculated and shown as a range — the
 * engine never silently picks one.
 */

export const ENGINE_VERSION = "1.0.0";

export type RatePeriod = "monthly" | "annual" | "unknown";
export type DayCount = "calendar_month" | "actual_365" | "actual_360" | "thirty_360" | "unknown";
export type Allocation = "interest_first" | "principal_first" | "charges_interest_principal" | "unknown";
export type MethodKey = "flat" | "simple_reducing" | "compound";

export type EngineInput = {
  principal: number | null;
  borrowingDate: string | null;
  /** Percent per rate period, e.g. 3 = 3%. */
  interestRate: number | null;
  ratePeriod: RatePeriod;
  interestType: "simple" | "compound" | "unknown";
  interestMethod: "flat" | "reducing" | "unknown";
  compoundingFrequency: "monthly" | "quarterly" | "half_yearly" | "annually" | "not_applicable" | "unknown";
  dayCount: DayCount;
  allocation: Allocation;
  tenureMonths: number | null;
  amountActuallyReceived: number | null;
  lenderDemand: number | null;
  lenderDemandDate: string | null;
  totalRepaidReported: number | null;
  repayments: { date: string | null; amount: number }[];
  charges: { date: string | null; amount: number | null; label: string; hasWrittenBasis: "yes" | "no" | "unknown" }[];
  /** Today's date (ISO), passed in so results are reproducible. */
  today: string;
};

export type Step = {
  date: string;
  kind: "start" | "repayment" | "charge" | "capitalise" | "end";
  description: string;
  /** Repayment or charge amount (0 for other steps). */
  amount: number;
  /** Interest accrued since the previous step. */
  interestAccrued: number;
  principalBalance: number;
  interestBalance: number;
  chargesBalance: number;
  balance: number;
};

export type ScenarioResult = {
  key: string;
  method: MethodKey;
  label: string;
  description: string;
  compoundEveryMonths: number | null;
  totalInterest: number;
  chargesIncluded: number;
  totalRepaid: number;
  principalOutstanding: number;
  interestOutstanding: number;
  chargesOutstanding: number;
  /** Negative = the borrower has paid more than owed. */
  balance: number;
  /** Lender's demand minus this balance. Positive = the demand is higher. */
  discrepancy: number | null;
  steps: Step[];
};

export type AnalysisResult = {
  engineVersion: string;
  status: "complete" | "scenarios" | "insufficient";
  asOfDate: string | null;
  principal: number | null;
  totalRepaid: number;
  lenderDemand: number | null;
  scenarios: ScenarioResult[];
  /** The single applicable scenario when all terms are known. */
  primaryKey: string | null;
  range: { min: number; max: number } | null;
  chargesNeedingReview: { label: string; amount: number | null; hasWrittenBasis: string }[];
  rateSummary: { rate: number; ratePeriod: "monthly" | "annual"; perYearSimple: number; perYearCompounded: number | null; perMonth: number } | null;
  flatTermSummary: {
    tenureMonths: number;
    totalInterest: number;
    totalPayable: number;
    monthlyInstalment: number;
    /** The reducing-balance yearly rate with the same instalments: the true cost of a flat rate. */
    equivalentReducingRate: number;
  } | null;
  assumptions: string[];
  missing: string[];
  warnings: string[];
};

/** Rounds to the paisa (2 decimals), avoiding floating-point drift such as 1.005. */
export function round2(x: number): number {
  // Half a paisa rounds away from zero for negative amounts too (overpayments).
  return (Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * 100)) / 100 || 0;
}

const rupees = (n: number) => `₹${round2(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Time from `start` to `d`, measured in rate periods (months for a monthly rate, years for annual). */
export function makeTime(start: string, ratePeriod: "monthly" | "annual", dayCount: Exclude<DayCount, "unknown">) {
  return (d: string): number => {
    if (d <= start) return 0;
    const months =
      dayCount === "calendar_month" ? calendarMonths(start, d)
      : dayCount === "actual_365" ? (daysBetween(start, d) * 12) / 365
      : dayCount === "actual_360" ? (daysBetween(start, d) * 12) / 360
      : days30360(start, d) / 30;
    return ratePeriod === "monthly" ? months : months / 12;
  };
}

const COMPOUND_MONTHS = { monthly: 1, quarterly: 3, half_yearly: 6, annually: 12 } as const;
const ALLOCATION_ORDER = {
  interest_first: ["interest", "principal", "charges"],
  principal_first: ["principal", "interest", "charges"],
  charges_interest_principal: ["charges", "interest", "principal"],
} as const;

type Event = { date: string; kind: Step["kind"]; amount: number; description: string; order: number };

type Ctx = {
  principal: number;
  start: string;
  asOf: string;
  rate: number; // fraction per period
  time: (d: string) => number;
  allocation: Exclude<Allocation, "unknown">;
  repayments: { date: string; amount: number }[];
  charges: { date: string; amount: number; label: string }[];
};

/** Runs one method over the timeline. */
export function simulate(ctx: Ctx, method: MethodKey, compoundEveryMonths: number | null): Omit<ScenarioResult, "key" | "label" | "description" | "discrepancy"> {
  const events: Event[] = [];
  if (method === "compound" && compoundEveryMonths) {
    for (let k = 1; k <= 1200; k++) {
      const d = addMonths(ctx.start, k * compoundEveryMonths);
      if (d > ctx.asOf) break;
      events.push({ date: d, kind: "capitalise", amount: 0, description: "Unpaid interest added to the loan", order: 0 });
    }
  }
  for (const c of ctx.charges) events.push({ date: c.date, kind: "charge", amount: c.amount, description: c.label, order: 1 });
  for (const r of ctx.repayments) events.push({ date: r.date, kind: "repayment", amount: r.amount, description: "Repayment", order: 2 });
  events.push({ date: ctx.asOf, kind: "end", amount: 0, description: "Calculation date", order: 3 });
  events.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));

  let P = ctx.principal; // interest-bearing principal (includes added interest for compound)
  let I = 0; // unpaid interest not yet added to the loan
  let C = 0; // unpaid charges
  let credit = 0; // money paid beyond everything owed
  let totalInterest = 0;
  let chargesIncluded = 0;
  let totalRepaid = 0;
  let lastT = 0;
  let closed = false; // fully repaid: interest stops

  const balance = () => round2(P + I + C - credit);
  const snapshot = (e: Pick<Event, "date" | "kind" | "description" | "amount">, interestAccrued: number): Step => ({
    date: e.date,
    kind: e.kind,
    description: e.description,
    amount: e.amount,
    interestAccrued,
    principalBalance: round2(P),
    interestBalance: round2(I),
    chargesBalance: round2(C),
    balance: balance(),
  });
  const steps: Step[] = [snapshot({ date: ctx.start, kind: "start", description: "Loan taken", amount: ctx.principal }, 0)];

  for (const e of events) {
    const t = ctx.time(e.date);
    let accrued = 0;
    if (!closed && t > lastT) {
      const base = method === "flat" ? ctx.principal : P;
      accrued = round2(base * ctx.rate * (t - lastT));
      I = round2(I + accrued);
      totalInterest = round2(totalInterest + accrued);
    }
    lastT = Math.max(lastT, t);

    if (e.kind === "capitalise") {
      if (I <= 0) continue;
      P = round2(P + I);
      I = 0;
    } else if (e.kind === "charge") {
      C = round2(C + e.amount);
      chargesIncluded = round2(chargesIncluded + e.amount);
      closed = false;
    } else if (e.kind === "repayment") {
      totalRepaid = round2(totalRepaid + e.amount);
      let left = e.amount;
      for (const part of ALLOCATION_ORDER[ctx.allocation]) {
        if (part === "interest") { const x = Math.min(left, I); I = round2(I - x); left = round2(left - x); }
        if (part === "principal") { const x = Math.min(left, P); P = round2(P - x); left = round2(left - x); }
        if (part === "charges") { const x = Math.min(left, C); C = round2(C - x); left = round2(left - x); }
      }
      credit = round2(credit + left);
      if (P <= 0 && I <= 0 && C <= 0) closed = true;
    }
    steps.push(snapshot(e, accrued));
  }

  return {
    method,
    compoundEveryMonths: method === "compound" ? compoundEveryMonths : null,
    totalInterest,
    chargesIncluded,
    totalRepaid,
    principalOutstanding: round2(P),
    interestOutstanding: round2(I),
    chargesOutstanding: round2(C),
    balance: balance(),
    steps,
  };
}

/** Monthly rate i such that `instalment` paid n times repays `principal` (bisection). */
export function solveMonthlyRate(principal: number, instalment: number, n: number): number {
  if (instalment * n <= principal) return 0;
  const pv = (i: number) => (i === 0 ? instalment * n : (instalment * (1 - Math.pow(1 + i, -n))) / i);
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > principal) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const METHOD_TEXT: Record<MethodKey, { label: string; description: string }> = {
  flat: {
    label: "Flat interest",
    description: "Interest is charged every period on the full original amount, even after part-payments.",
  },
  simple_reducing: {
    label: "Simple interest on the reducing balance",
    description: "Interest is charged only on the amount still owed. Unpaid interest does not itself earn interest.",
  },
  compound: {
    label: "Compound interest",
    description: "Unpaid interest is added to the loan at regular intervals, and then also earns interest.",
  },
};

const EVERY_TEXT: Record<number, string> = { 1: "every month", 3: "every quarter", 6: "every six months", 12: "every year" };

export function analyseLoan(input: EngineInput): AnalysisResult {
  const assumptions: string[] = [];
  const missing: string[] = [];
  const warnings: string[] = [];
  const result = (over: Partial<AnalysisResult>): AnalysisResult => ({
    engineVersion: ENGINE_VERSION,
    status: "insufficient",
    asOfDate: null,
    principal: input.principal,
    totalRepaid: 0,
    lenderDemand: input.lenderDemand,
    scenarios: [],
    primaryKey: null,
    range: null,
    chargesNeedingReview: [],
    rateSummary: null,
    flatTermSummary: null,
    assumptions,
    missing,
    warnings,
    ...over,
  });

  // ---------------------------------------------------------------- required facts
  if (!input.principal || input.principal <= 0) missing.push("Amount borrowed");
  if (!input.borrowingDate) missing.push("Date borrowed");
  if (!input.interestRate || input.interestRate <= 0) missing.push("Interest rate");
  if (input.ratePeriod === "unknown") missing.push("Whether the rate is per month or per year");
  const listedRepaid = round2(input.repayments.reduce((s, r) => s + r.amount, 0));
  if (missing.length) {
    return result({ totalRepaid: listedRepaid || input.totalRepaidReported || 0 });
  }
  const principal = input.principal!;
  const start = input.borrowingDate!;
  const ratePeriod = input.ratePeriod as "monthly" | "annual";
  const rate = input.interestRate!;

  // ---------------------------------------------------------------- calculation date
  let asOf = input.lenderDemandDate && input.lenderDemandDate >= start ? input.lenderDemandDate : input.today;
  if (input.lenderDemandDate) {
    assumptions.push(`Calculated up to the date of the lender's demand (${input.lenderDemandDate}), so the two can be compared.`);
  } else {
    assumptions.push(`Calculated up to today (${input.today}), because the date of the lender's demand is not known.`);
  }
  const lastPaid = input.repayments.reduce<string | null>((m, r) => (r.date && r.date <= input.today && (!m || r.date > m) ? r.date : m), null);
  if (lastPaid && lastPaid > asOf) {
    warnings.push("Some payments were made after the lender's demand. The calculation runs up to today instead, so it includes them.");
    asOf = input.today;
  }
  if (start > asOf) {
    warnings.push("The date borrowed is after the calculation date. Please check the dates.");
    return result({ totalRepaid: listedRepaid });
  }

  // ---------------------------------------------------------------- day count
  let dayCount = input.dayCount;
  if (dayCount === "unknown") {
    dayCount = ratePeriod === "monthly" ? "calendar_month" : "actual_365";
    assumptions.push(
      ratePeriod === "monthly"
        ? "Time is counted in calendar months; a part-month counts in proportion to its days."
        : "Time is counted in days, with a 365-day year.",
    );
  }
  const time = makeTime(start, ratePeriod, dayCount);

  // ---------------------------------------------------------------- repayments
  const repayments: { date: string; amount: number }[] = [];
  let undated = 0;
  for (const r of input.repayments) {
    if (!r.date) { undated = round2(undated + r.amount); continue; }
    if (r.date < start) { warnings.push(`A payment of ${rupees(r.amount)} dated ${r.date} is before the loan date and was left out.`); continue; }
    if (r.date > asOf) { warnings.push(`A payment of ${rupees(r.amount)} dated ${r.date} is in the future and was left out.`); continue; }
    repayments.push({ date: r.date, amount: r.amount });
  }
  if (input.repayments.length === 0 && input.totalRepaidReported) {
    undated = input.totalRepaidReported;
    assumptions.push(`Individual payments are not listed, so the total you reported (${rupees(undated)}) is used.`);
  } else if (input.totalRepaidReported && Math.abs(listedRepaid - input.totalRepaidReported) >= 1) {
    warnings.push(`Your listed payments add up to ${rupees(listedRepaid)}, but you said you repaid ${rupees(input.totalRepaidReported)} in total. The calculation uses the listed payments.`);
  }
  if (undated > 0) {
    repayments.push({ date: asOf, amount: undated });
    assumptions.push(
      `Payments without a date (${rupees(undated)}) are treated as paid on the calculation date. If they were paid earlier, the balance under the reducing-balance and compound methods would be lower.`,
    );
  }
  if (repayments.length === 0) assumptions.push("No repayments are recorded.");

  // ---------------------------------------------------------------- charges
  const charges: Ctx["charges"] = [];
  const chargesNeedingReview: AnalysisResult["chargesNeedingReview"] = [];
  for (const c of input.charges) {
    if (c.hasWrittenBasis === "yes" && c.amount) {
      charges.push({ date: c.date && c.date >= start && c.date <= asOf ? c.date : asOf, amount: c.amount, label: c.label });
    } else {
      chargesNeedingReview.push({ label: c.label, amount: c.amount, hasWrittenBasis: c.hasWrittenBasis });
    }
  }
  if (charges.length) assumptions.push("Extra charges that you said are in a written agreement are included in the balance.");
  if (chargesNeedingReview.length) {
    assumptions.push("Extra charges without a confirmed written agreement are NOT included. They are listed separately for examination — this does not mean they are illegal.");
  }

  // ---------------------------------------------------------------- allocation
  let allocation = input.allocation;
  if (allocation === "unknown") {
    allocation = "interest_first";
    assumptions.push("Each payment is applied to unpaid interest first, then to the principal (the usual practice). This affects the reducing-balance and compound methods.");
  }

  // ---------------------------------------------------------------- which methods
  let methods: MethodKey[];
  if (input.interestType === "compound") {
    methods = ["compound"];
    if (input.interestMethod === "flat") warnings.push("Compound interest is always charged on the outstanding balance, so 'flat' was not applied.");
  } else if (input.interestType === "simple") {
    methods = input.interestMethod === "flat" ? ["flat"] : input.interestMethod === "reducing" ? ["simple_reducing"] : ["flat", "simple_reducing"];
  } else {
    methods = input.interestMethod === "flat" ? ["flat"] : input.interestMethod === "reducing" ? ["simple_reducing", "compound"] : ["flat", "simple_reducing", "compound"];
    if (input.interestMethod === "flat") assumptions.push("Flat interest is treated as simple interest (interest is never charged on interest).");
  }
  if (methods.length > 1) {
    assumptions.push("Some loan terms are not known, so each possible method is calculated. The real balance depends on what was agreed.");
  }

  let compoundEvery: number | null = null;
  if (methods.includes("compound")) {
    const f = input.compoundingFrequency;
    if (f in COMPOUND_MONTHS) compoundEvery = COMPOUND_MONTHS[f as keyof typeof COMPOUND_MONTHS];
    else {
      compoundEvery = ratePeriod === "monthly" ? 1 : 12;
      assumptions.push(`For compound interest, unpaid interest is assumed to be added ${EVERY_TEXT[compoundEvery]}, matching the rate period.`);
    }
  }

  const ctx: Ctx = { principal, start, asOf, rate: rate / 100, time, allocation, repayments, charges };
  const scenarios: ScenarioResult[] = methods.map((m) => {
    const sim = simulate(ctx, m, m === "compound" ? compoundEvery : null);
    const text = METHOD_TEXT[m];
    return {
      ...sim,
      key: m,
      label: m === "compound" ? `${text.label} (added ${EVERY_TEXT[compoundEvery!]})` : text.label,
      description: text.description,
      discrepancy: input.lenderDemand === null ? null : round2(input.lenderDemand - sim.balance),
    };
  });

  // ---------------------------------------------------------------- summaries
  const perMonth = ratePeriod === "monthly" ? rate : rate / 12;
  const rateSummary: AnalysisResult["rateSummary"] = {
    rate,
    ratePeriod,
    perMonth: round2(perMonth),
    perYearSimple: round2(ratePeriod === "monthly" ? rate * 12 : rate),
    perYearCompounded: ratePeriod === "monthly" ? round2((Math.pow(1 + rate / 100, 12) - 1) * 100) : null,
  };

  let flatTermSummary: AnalysisResult["flatTermSummary"] = null;
  if (methods.includes("flat") && input.tenureMonths && input.tenureMonths > 0) {
    const n = input.tenureMonths;
    const totalInterest = round2(principal * (rate / 100) * (ratePeriod === "monthly" ? n : n / 12));
    const totalPayable = round2(principal + totalInterest);
    const monthlyInstalment = round2(totalPayable / n);
    const i = solveMonthlyRate(principal, totalPayable / n, n);
    flatTermSummary = { tenureMonths: n, totalInterest, totalPayable, monthlyInstalment, equivalentReducingRate: round2(i * 12 * 100) };
  }

  if (input.amountActuallyReceived && input.amountActuallyReceived < principal) {
    warnings.push(
      `You received ${rupees(input.amountActuallyReceived)}, less than the loan amount of ${rupees(principal)}. Interest here is calculated on ${rupees(principal)}. Money deducted at the start can matter — keep any proof.`,
    );
  }
  if (input.lenderDemand === null) missing.push("The lender's current demand (needed to compare)");

  const balances = scenarios.map((s) => s.balance);
  const single = scenarios.length === 1;
  return result({
    status: single ? "complete" : "scenarios",
    asOfDate: asOf,
    totalRepaid: round2(repayments.reduce((s, r) => s + r.amount, 0)),
    scenarios,
    primaryKey: single ? scenarios[0].key : null,
    range: { min: Math.min(...balances), max: Math.max(...balances) },
    chargesNeedingReview,
    rateSummary,
    flatTermSummary,
  });
}
