import { formatINR, formatISODate } from "@/modules/extraction/fields";
import type { AnalysisResult } from "./engine";

/**
 * Plain-language explanation of a result, built from fixed sentences — no AI —
 * so the words can never disagree with the numbers.
 */
export function explainAnalysis(r: AnalysisResult): string[] {
  if (r.status === "insufficient") {
    return [
      r.missing.length
        ? `We can't calculate the balance yet. Still needed: ${r.missing.join(", ").toLowerCase()}.`
        : "We can't calculate the balance yet. Please check the dates in your case summary.",
      "Add these on the Case summary page, confirm it again, and run the analysis.",
    ];
  }
  const lines: string[] = [];
  const when = r.asOfDate ? formatISODate(r.asOfDate) : "the calculation date";
  const owe = (b: number) => (b < 0 ? `you have paid ${formatINR(-b)} more than you owe` : `you would owe ${formatINR(b)}`);

  if (r.status === "complete") {
    const s = r.scenarios[0];
    lines.push(`Using ${s.label.toLowerCase()} at the confirmed rate, ${owe(s.balance)} on ${when}.`);
    lines.push(`That is ${formatINR(r.principal ?? 0)} borrowed, plus ${formatINR(s.totalInterest)} interest${s.chargesIncluded ? ` and ${formatINR(s.chargesIncluded)} agreed charges` : ""}, minus ${formatINR(s.totalRepaid)} repaid.`);
    if (s.discrepancy !== null && r.lenderDemand !== null) lines.push(compare(r.lenderDemand, s.discrepancy));
  } else {
    const { min, max } = r.range!;
    lines.push(
      `Some loan terms are not known, so we calculated ${r.scenarios.length} possible ways. On ${when}, the balance would be between ${formatINR(min)} and ${formatINR(max)}, depending on what was agreed.`,
    );
    if (r.lenderDemand !== null) {
      const d = r.lenderDemand;
      if (d > max + 0.5) lines.push(`The lender is asking for ${formatINR(d)}, which is ${formatINR(d - max)} more than even the highest of these.`);
      else if (d < min - 0.5) lines.push(`The lender is asking for ${formatINR(d)}, which is less than all of these.`);
      else lines.push(`The lender's demand of ${formatINR(d)} falls within this range. Which method was agreed decides whether it is right.`);
    }
  }
  if (r.chargesNeedingReview.length) {
    lines.push(`${r.chargesNeedingReview.length} extra charge${r.chargesNeedingReview.length === 1 ? " is" : "s are"} not included because no written agreement for ${r.chargesNeedingReview.length === 1 ? "it" : "them"} is confirmed.`);
  }
  lines.push("A difference does not by itself mean the lender acted illegally. It means the calculation needs a closer look.");
  return lines;
}

function compare(demand: number, discrepancy: number): string {
  if (Math.abs(discrepancy) < 1) return `The lender is asking for ${formatINR(demand)}, which matches this calculation.`;
  return discrepancy > 0
    ? `The lender is asking for ${formatINR(demand)}, which is ${formatINR(discrepancy)} more than this calculation.`
    : `The lender is asking for ${formatINR(demand)}, which is ${formatINR(-discrepancy)} less than this calculation.`;
}
