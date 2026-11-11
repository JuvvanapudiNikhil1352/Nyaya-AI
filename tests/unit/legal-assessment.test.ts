import { describe, expect, it } from "vitest";
import { buildQueries, checkAssessment, lawyerTriggers, notCovered, textProblems, type AILegal, type Passage } from "@/modules/legal/assessment";

const P: Passage[] = [
  { label: "P1", chunkId: "c1", sourceTitle: "The Usurious Loans Act, 1918", sourceUrl: "https://thc.nic.in/x.pdf", documentVersion: "v", sectionReference: "Section 3", content: "re-open the transaction" },
  { label: "P2", chunkId: "c2", sourceTitle: "The Legal Services Authorities Act, 1987", sourceUrl: "https://patnahighcourt.gov.in/x.pdf", documentVersion: "v", sectionReference: "Section 12", content: "Criteria for giving legal services" },
  { label: "P3", chunkId: "c3", sourceTitle: "The Legal Services Authorities Act, 1987", sourceUrl: "https://patnahighcourt.gov.in/x.pdf", documentVersion: "v", sectionReference: "Section 13", content: "Entitlement" },
];
const point = (over: Partial<AILegal["points"][number]>) => ({ kind: "relevant_law", title: "Court can re-open the loan", explanation: "Under the Usurious Loans Act, 1918, a court may re-open a loan if interest is excessive.", citations: ["P1"], ...over });
const raw = (points: AILegal["points"], over: Partial<AILegal> = {}): AILegal => ({ summary: "A court may look at excessive interest.", points, facts_needed: [], lawyer_needed: false, lawyer_reason: "", ...over });

describe("citation checks", () => {
  it("keeps a point that cites a real passage and stays within it", () => {
    const r = checkAssessment(raw([point({})]), P);
    expect(r.points).toHaveLength(1);
    expect(r.removed).toEqual([]);
  });
  it("removes points without a valid citation", () => {
    const r = checkAssessment(raw([point({ citations: [] }), point({ title: "x", citations: ["P9"] })]), P);
    expect(r.points).toEqual([]);
    expect(r.removed.map((x) => x.reason)).toEqual(["no valid source cited", "no valid source cited"]);
  });
  it("removes points naming a section that is not in their sources (invented sections)", () => {
    const r = checkAssessment(raw([point({ explanation: "Section 5 of the Usurious Loans Act, 1918 caps interest." })]), P);
    expect(r.points).toEqual([]);
    expect(r.removed[0].reason).toMatch(/section 5/);
    expect(textProblems("See sections 12 and 14.", [P[1], P[2]])).toMatch(/section 14/);
    expect(textProblems("See sections 12 and 13.", [P[1], P[2]])).toBeNull();
    expect(textProblems("Under s. 3 the court may act.", [P[0]])).toBeNull();
  });
  it("removes points naming an Act that is not in their sources (invented laws)", () => {
    const r = checkAssessment(raw([point({ explanation: "The Telangana Money Lenders Act, 1349 requires a licence." })]), P);
    expect(r.removed[0].reason).toMatch(/Money Lenders Act/);
    // A real Act cited from the wrong passage is also rejected
    expect(textProblems("The Legal Services Authorities Act, 1987 helps.", [P[0]])).toMatch(/not in its sources/);
  });
  it("removes conclusions of illegality (a high rate alone is not proof)", () => {
    const r = checkAssessment(raw([point({ explanation: "The lender is clearly illegal." }), point({ title: "y", explanation: "He has committed an offence." })]), P);
    expect(r.points).toEqual([]);
    expect(textProblems("This does not by itself mean the loan is illegal.", P)).toBeNull(); // careful negation is allowed
    expect(textProblems("High interest is common. The loan is illegal.", P)).toMatch(/illegality/);
    expect(textProblems("A court may consider whether the transaction was unfair.", [P[0]])).toBeNull();
  });
  it("replaces a summary that invents law with a fixed, safe summary", () => {
    const r = checkAssessment(raw([], { summary: "Section 21 of the Money Lenders Act makes this illegal." }), P);
    expect(r.summary).toMatch(/verified legal sources below may be relevant/);
  });
  it("normalises citation labels and limits to 6 points", () => {
    const many = Array.from({ length: 9 }, (_, i) => point({ title: `t${i}`, citations: ["p1", "P1"] }));
    const r = checkAssessment(raw(many), P);
    expect(r.points).toHaveLength(6);
    expect(r.points[0].citations).toEqual(["P1"]);
  });
});

describe("queries, coverage and escalation", () => {
  const base = { state: "TG" as const, safetyConcern: false, hasCharges: false, compound: false, demandAboveCalculation: false };
  it("adds questions for threats, charges and high demands", () => {
    expect(buildQueries(base)).toHaveLength(3);
    const q = buildQueries({ ...base, safetyConcern: true, hasCharges: true, compound: null, demandAboveCalculation: true });
    expect(q.join(" ")).toMatch(/threatening/);
    expect(q.join(" ")).toMatch(/penalties/);
    expect(q.join(" ")).toMatch(/Compound interest/);
    expect(q.join(" ")).toMatch(/demands more/);
    expect(buildQueries(base)[2]).toMatch(/Telangana/);
  });
  it("lists topics that have no verified source", () => {
    const titles = ["The Usurious Loans Act, 1918", "The Legal Services Authorities Act, 1987"];
    expect(notCovered(titles, { state: "TG", safetyConcern: false })).toEqual([
      "Telangana money-lending law (licence and registration of money lenders)",
      "Contract law on penalties and undue influence (Indian Contract Act, 1872)",
    ]);
    expect(notCovered(titles, { state: "AP", safetyConcern: true })).toContain("Criminal law on threats and intimidation (Bharatiya Nyaya Sanhita, 2023)");
    expect(notCovered([...titles, "The Telangana Money Lenders Act, 1349 F"], { state: "TG", safetyConcern: false })).not.toContain(
      "Telangana money-lending law (licence and registration of money lenders)",
    );
  });
  it("recommends professional help for threats or a disputed demand, whatever the AI says (spec Test 5)", () => {
    expect(lawyerTriggers({ ...base, safetyConcern: true, notCoveredCount: 0 }, false)).toEqual(["You reported threats or harassment."]);
    expect(lawyerTriggers({ ...base, notCoveredCount: 0 }, false)).toEqual([]);
    expect(lawyerTriggers({ ...base, notCoveredCount: 0 }, true)).toHaveLength(1);
  });
});

describe("known misstatement fixes", () => {
  it("turns 'excessive or unfair' into 'excessive and unfair' and records the change", () => {
    const r = checkAssessment(raw([point({ explanation: "If the court finds the interest excessive or the transaction substantially unfair, it may re-open it." })], { summary: "A court may act if the interest is excessive or the deal unfair." }), P);
    expect(r.points[0].explanation).toMatch(/excessive and the transaction substantially unfair/);
    expect(r.summary).toMatch(/excessive and the deal unfair/);
    expect(r.corrections).toHaveLength(1);
    expect(checkAssessment(raw([point({})]), P).corrections).toEqual([]);
  });
});
