import { formatINR, formatISODate } from "@/modules/extraction/fields";
import type { ChecklistItem } from "@/modules/documents/evidence";

/**
 * Resolution paths and action plans. Deterministic (no AI): fixed, reviewed
 * wording plus rules over the confirmed facts, the calculation and the legal
 * assessment. The borrower always makes the final choice.
 */

export const RESOLUTION_TYPES = ["clarification", "negotiation", "legal_action", "legal_assistance"] as const;
export type ResolutionType = (typeof RESOLUTION_TYPES)[number];
export const isResolutionType = (v: string): v is ResolutionType => (RESOLUTION_TYPES as readonly string[]).includes(v);

export type ResolutionOption = {
  key: ResolutionType;
  title: string;
  involves: string;
  howWeHelp: string;
  benefits: string[];
  risks: string[];
  needed: string[];
  /** Drafts that Nyaya AI can prepare for this path (Phase 13). */
  drafts: ("clarification_request" | "demand_letter" | "complaint_draft" | "legal_notice_draft")[];
};

export const RESOLUTION_OPTIONS: Record<ResolutionType, ResolutionOption> = {
  clarification: {
    key: "clarification",
    title: "Clarification",
    involves: "Ask the lender for a written breakdown of how they calculated the amount they are demanding: the interest rate and method, any charges, and which of your payments they counted.",
    howWeHelp: "We tell you exactly what to ask for, based on your confirmed facts, and show you how to compare their answer with our calculation. (Ready-made letter drafts are coming soon.)",
    benefits: ["Low cost and low risk.", "Often uncovers mistakes or missing payments.", "Creates a written record that helps if the dispute continues."],
    risks: ["The lender may not reply, or may refuse to put anything in writing.", "It does not by itself change what you owe."],
    needed: ["Your loan details and the lender's current demand.", "A list of your payments with dates."],
    drafts: ["clarification_request"],
  },
  negotiation: {
    key: "negotiation",
    title: "Negotiation",
    involves: "Try to agree a fair settlement amount or repayment schedule with the lender, recorded in writing.",
    howWeHelp: "We show the calculated figures that support your position and what a written agreement should say. (Ready-made letter drafts are coming soon.)",
    benefits: ["Can end the dispute quickly.", "Avoids the cost and time of formal steps."],
    risks: ["Any agreement must be in writing, with a receipt for every payment.", "Don't negotiate alone if you feel unsafe.", "You may agree to pay more than a court might order."],
    needed: ["The calculated balance and the lender's demand.", "What you can realistically pay, and when."],
    drafts: ["demand_letter"],
  },
  legal_action: {
    key: "legal_action",
    title: "Legal action",
    involves: "Formal steps such as a legal notice, or a complaint to the appropriate authority. Going to court needs the right proceeding, court and documents.",
    howWeHelp: "We explain the verified legal provisions and organise your facts, calculation and evidence for a lawyer or legal aid. Nothing is ever filed automatically. (Notice and complaint drafts are coming soon.)",
    benefits: ["Puts your position on formal record.", "May lead to the dispute being decided by a court or authority."],
    risks: ["Takes time and may cost money; outcomes are never guaranteed.", "Time limits may apply — get advice early.", "A lawyer or legal aid should check any notice or complaint before it is sent."],
    needed: ["Confirmed facts and calculation.", "Your documents and evidence.", "Advice on the right authority or court."],
    drafts: ["legal_notice_draft", "complaint_draft"],
  },
  legal_assistance: {
    key: "legal_assistance",
    title: "Legal assistance",
    involves: "Get help from a lawyer, or from your District Legal Services Authority, which may provide free legal aid if you are eligible.",
    howWeHelp: "We prepare a clear case summary, calculation and document list you can take to your first meeting.",
    benefits: ["A professional checks your case and options.", "Free legal aid is available to eligible people."],
    risks: ["Free legal aid depends on eligibility criteria and your state's income limit.", "Private lawyers charge fees."],
    needed: ["Your case summary and calculation.", "Copies of your documents.", "Proof of identity (show it in person; never share Aadhaar numbers online)."],
    drafts: [],
  },
};

// ---------------------------------------------------------------- recommendation

export type PlanContext = {
  safetyConcern: boolean;
  analysis: {
    status: "complete" | "scenarios" | "insufficient";
    balance: number | null; // single-method balance
    range: { min: number; max: number } | null;
    lenderDemand: number | null;
    asOfDate: string | null;
    totalRepaid: number;
    chargesReviewCount: number;
  } | null;
  legal: { exists: boolean; lawyerRecommended: boolean; notCoveredCount: number };
  evidence: Pick<ChecklistItem, "key" | "label" | "status">[];
};

export type Recommendation = { recommended: ResolutionType; reasons: string[]; alsoConsider: ResolutionType[]; alerts: string[] };

export function recommend(ctx: PlanContext): Recommendation {
  const alerts: string[] = [];
  if (ctx.safetyConcern) alerts.push("You reported threats or harassment. Your safety comes first, whichever path you choose: call 112 in an emergency, and you can report threats at your nearest police station.");
  alerts.push("If you have received a court summons, a legal notice or any document with a deadline, contact legal aid or a lawyer immediately — deadlines can't wait for the other steps.");

  const a = ctx.analysis;
  const alsoConsider = new Set<ResolutionType>();
  if (ctx.legal.lawyerRecommended) alsoConsider.add("legal_assistance");

  let recommended: ResolutionType;
  const reasons: string[] = [];
  if (ctx.safetyConcern) {
    recommended = "legal_assistance";
    reasons.push("Because of the threats you reported, getting help from legal aid or a lawyer first is the safest start.");
  } else if (!a || a.status === "insufficient") {
    recommended = "clarification";
    reasons.push("The balance can't be calculated yet. A written breakdown from the lender is the best way to fill the gaps.");
  } else if (a.lenderDemand === null) {
    recommended = "clarification";
    reasons.push("The lender's exact demand isn't known. Ask for it in writing, with a breakdown.");
  } else {
    const high = a.balance ?? a.range!.max;
    const low = a.balance ?? a.range!.min;
    if (a.lenderDemand > high + 1) {
      recommended = "clarification";
      reasons.push(`The lender is asking for ${formatINR(a.lenderDemand)}, which is ${formatINR(a.lenderDemand - high)} more than ${a.balance !== null ? "our calculation" : "even the highest of our calculations"}. Asking for their written breakdown is a low-risk first step.`);
      alsoConsider.add("negotiation");
    } else if (a.status === "scenarios" && a.lenderDemand >= low - 1) {
      recommended = "clarification";
      reasons.push("The lender's demand falls within our range, so whether it is right depends on loan terms that aren't known. A written breakdown would settle this.");
    } else {
      recommended = "negotiation";
      reasons.push(`The lender's demand of ${formatINR(a.lenderDemand)} is not above our calculation. Agreeing a settlement in writing may be the quickest way to close the loan.`);
    }
  }
  if (a && a.chargesReviewCount > 0) reasons.push(`${a.chargesReviewCount} extra charge${a.chargesReviewCount === 1 ? " needs" : "s need"} examining: ask the lender what agreement they are based on.`);
  if (ctx.legal.notCoveredCount > 0) alsoConsider.add("legal_assistance");
  alsoConsider.delete(recommended);
  return { recommended, reasons, alsoConsider: [...alsoConsider], alerts };
}

// ---------------------------------------------------------------- action plan

export type PlanStep = { id: string; title: string; detail: string; link?: { segment: string; label: string }; done: boolean };

const step = (id: string, title: string, detail: string, link?: PlanStep["link"]): PlanStep => ({ id, title, detail, link, done: false });

function evidenceStep(ctx: PlanContext): PlanStep {
  const have = ctx.evidence.filter((e) => e.status === "uploaded" || e.status === "check" || e.status === "partial").map((e) => e.label.toLowerCase());
  const gaps = ctx.evidence.filter((e) => e.status === "not_checked").map((e) => e.label.toLowerCase());
  const parts = [
    have.length ? `You have: ${have.join("; ")}.` : "No documents are uploaded yet.",
    gaps.length ? `Look for: ${gaps.join("; ")}. Missing items don't stop you, but they make your account easier to dispute.` : "",
    "Keep originals safe and work from copies.",
  ];
  return step("organise-evidence", "Organise your evidence", parts.filter(Boolean).join(" "), { segment: "documents", label: "Documents & evidence" });
}

function figuresText(a: PlanContext["analysis"]): string {
  if (!a || a.status === "insufficient") return "Our calculation is not complete yet.";
  const when = a.asOfDate ? ` on ${formatISODate(a.asOfDate)}` : "";
  return a.balance !== null ? `Our calculation is ${formatINR(a.balance)}${when}.` : `Our calculation is between ${formatINR(a.range!.min)} and ${formatINR(a.range!.max)}${when}, depending on the agreed terms.`;
}

export function buildActionPlan(type: ResolutionType, ctx: PlanContext): PlanStep[] {
  const a = ctx.analysis;
  const steps: PlanStep[] = [];
  if (ctx.safetyConcern) {
    steps.push(step("safety", "Stay safe first", "Don't meet the lender alone. Keep threatening messages and call records. In an emergency call 112; you can report threats at your nearest police station."));
  }
  steps.push(evidenceStep(ctx));

  switch (type) {
    case "clarification":
      steps.push(
        step("request-breakdown", "Ask the lender for a written breakdown",
          `Ask how they reached ${a?.lenderDemand != null ? formatINR(a.lenderDemand) : "the amount they demand"}: the interest rate and method, the dates used, any charges, and every payment of yours they have counted.`,
          { segment: "summary", label: "Your confirmed details" }),
        step("send-with-proof", "Send it in a way you can prove", "Use registered post or a written message (such as WhatsApp) and keep a copy and the delivery proof. Stay polite and stick to facts."),
        step("compare", "Compare their answer with our calculation",
          `${figuresText(a)} Check whether they missed any payment, used a higher rate, compounded interest, or added charges.`,
          { segment: "financial", label: "Financial analysis" }),
        step("no-new-papers", "Don't sign anything new while the amount is unclear", "Avoid signing blank papers, new promissory notes or cheques until the amount is clear."),
      );
      break;
    case "negotiation":
      steps.push(
        step("settlement-range", "Decide what you can offer", `${figuresText(a)} Decide an amount and schedule you can actually keep to.`, { segment: "financial", label: "Financial analysis" }),
        step("written-proposal", "Make your proposal in writing", "Put the offer in writing, referring to your payments so far.", { segment: "summary", label: "Your confirmed payments" }),
        step("agreement-in-writing", "Get any agreement in writing", "Any settlement should be written and signed by both of you, saying the amount clears the loan in full, and the lender should return or cancel your original papers (promissory note, cheques)."),
        step("pay-with-proof", "Pay only with proof", "Pay by bank transfer or UPI where possible; for cash, always get a signed receipt with date and amount."),
      );
      break;
    case "legal_action":
      steps.push(
        step("read-legal", "Read the legal assessment", "Understand which verified provisions may apply and what facts would change the picture.", { segment: "legal", label: "Legal assessment" }),
        step("get-advice-first", "Get legal advice before any formal step", "A lawyer or legal aid should advise on the right notice, authority or court, and on any time limits, before anything is sent or filed."),
        step("prepare-drafts", "Prepare your papers for review", "Take your case summary, calculation and documents to your lawyer or legal aid, who can prepare any notice or complaint. Nothing is ever sent or filed automatically.", { segment: "summary", label: "Case summary" }),
      );
      if (ctx.safetyConcern) steps.push(step("police", "Report threats to the police", "You can report threats or harassment at your nearest police station. Take copies of messages and any recordings."));
      break;
    case "legal_assistance":
      steps.push(
        step("find-dlsa", "Contact your District Legal Services Authority", "It is usually in the district court complex. Ask whether you qualify for free legal aid; this depends on the criteria in the Legal Services Authorities Act and your state's current income limit."),
        step("prepare-pack", "Prepare a pack for the first meeting",
          "Take printed copies of your case summary, the calculation and your documents, plus proof of identity to show in person.",
          { segment: "summary", label: "Case summary" }),
        step("questions", "Questions to ask", `Ask: which law applies to my lender in my state; whether the demand is lawful; what I should do now; and whether any time limits apply.${ctx.legal.notCoveredCount ? " Mention that some state laws were not covered by Nyaya AI's sources." : ""}`),
      );
      break;
  }
  steps.push(step("review", "Keep your case up to date", "If anything changes — new payments, new demands, new messages — add it in the chat or case summary and recalculate.", { segment: "summary", label: "Case summary" }));
  return steps;
}
