/**
 * Evidence checklist: which kinds of proof the borrower has, and what is
 * limited when something is missing. Pure functions — safe for client and tests.
 * Missing evidence never blocks the borrower from continuing.
 */

export const DOCUMENT_TYPES = [
  { value: "loan_agreement", label: "Loan agreement" },
  { value: "promissory_note", label: "Promissory note" },
  { value: "handwritten_record", label: "Handwritten record" },
  { value: "receipt", label: "Payment receipt" },
  { value: "bank_statement", label: "Bank / UPI statement" },
  { value: "repayment_record", label: "Repayment record" },
  { value: "chat_screenshot", label: "Chat screenshot (WhatsApp, SMS)" },
  { value: "demand_message", label: "Lender's demand" },
  { value: "other", label: "Other document" },
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"] | "unknown";

export function isDocumentType(v: string): v is Exclude<DocumentType, "unknown"> {
  return DOCUMENT_TYPES.some((t) => t.value === v);
}

export function documentTypeLabel(v: string): string {
  return DOCUMENT_TYPES.find((t) => t.value === v)?.label ?? "Not yet known";
}

export const EVIDENCE_ITEMS = [
  {
    key: "loan_agreement",
    label: "Loan agreement or promissory note",
    why: "Shows the amount, interest rate and terms that were agreed.",
    limitation: "The loan terms will rely on your own account, and the lender may describe them differently.",
  },
  {
    key: "money_received",
    label: "Proof of money received",
    why: "Shows how much you actually received, and when.",
    limitation: "The amount and date you received the money will rely on your own account.",
  },
  {
    key: "repayment_records",
    label: "Repayment receipts or records",
    why: "Proves the payments you made.",
    limitation: "Payments without proof may be disputed. Cash payments are the hardest to prove.",
  },
  {
    key: "bank_statements",
    label: "Bank / UPI statements",
    why: "An independent record of money sent or received.",
    limitation: "Bank or UPI payments can't be checked against an independent record.",
  },
  {
    key: "lender_messages",
    label: "Messages with the lender (WhatsApp, SMS)",
    why: "Can show what was agreed, what was paid, and how the lender behaved.",
    limitation: "What was said between you and the lender will rely on memory.",
  },
  {
    key: "lender_demand",
    label: "Lender's written demand",
    why: "Shows exactly how much the lender is asking for.",
    limitation: "The demanded amount will rely on what you were told.",
  },
] as const;
export type EvidenceKey = (typeof EVIDENCE_ITEMS)[number]["key"];
export const EVIDENCE_KEYS = EVIDENCE_ITEMS.map((e) => e.key) as [EvidenceKey, ...EvidenceKey[]];

export function isEvidenceKey(v: string): v is EvidenceKey {
  return (EVIDENCE_KEYS as string[]).includes(v);
}

/** Checklist items a document type always supports (the AI may add more). */
export const DEFAULT_COVERS: Record<string, EvidenceKey[]> = {
  loan_agreement: ["loan_agreement"],
  promissory_note: ["loan_agreement"],
  receipt: ["repayment_records"],
  repayment_record: ["repayment_records"],
  bank_statement: ["bank_statements"],
  chat_screenshot: ["lender_messages"],
  demand_message: ["lender_demand"],
};

export function evidenceCovers(documentType: string, aiCovers: string[] = []): EvidenceKey[] {
  const keys = new Set<EvidenceKey>(DEFAULT_COVERS[documentType] ?? []);
  for (const k of aiCovers) if (isEvidenceKey(k)) keys.add(k);
  return EVIDENCE_KEYS.filter((k) => keys.has(k));
}

/** What the borrower told us about an item (stored in evidence_items). */
export const EVIDENCE_MARKS = [
  { value: "partial", label: "I have some of these" },
  { value: "missing", label: "I don't have this" },
  { value: "not_applicable", label: "Doesn't apply to my loan" },
] as const;
export type EvidenceMark = (typeof EVIDENCE_MARKS)[number]["value"];

export function isEvidenceMark(v: string): v is EvidenceMark {
  return EVIDENCE_MARKS.some((m) => m.value === v);
}

export type ChecklistStatus =
  | "uploaded" // a document was read without problems
  | "check" // uploaded, but its details need the borrower's review
  | "partial" // borrower has only some
  | "dont_have"
  | "not_applicable"
  | "not_checked";

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  uploaded: "Uploaded",
  check: "Uploaded — please review",
  partial: "Partly available",
  dont_have: "You don't have this",
  not_applicable: "Doesn't apply",
  not_checked: "Not provided",
};

export type ChecklistDoc = { id: string; original_filename: string; extraction_status: string; evidence_covers: string[] | null; document_type: string };
export type ChecklistItem = {
  key: EvidenceKey;
  label: string;
  why: string;
  status: ChecklistStatus;
  mark: EvidenceMark | null;
  documents: { id: string; name: string }[];
  /** Shown when the item is not (fully) available. */
  limitation: string | null;
};

export function buildChecklist(docs: ChecklistDoc[], marks: { evidence_type: string; status: string }[]): ChecklistItem[] {
  return EVIDENCE_ITEMS.map((item) => {
    const related = docs.filter((d) => evidenceCovers(d.document_type, d.evidence_covers ?? []).includes(item.key));
    const raw = marks.find((m) => m.evidence_type === item.key)?.status ?? "";
    const mark = isEvidenceMark(raw) ? raw : null;

    let status: ChecklistStatus;
    if (related.length && mark === "partial") status = "partial";
    else if (related.length) status = related.some((d) => d.extraction_status === "completed") ? "uploaded" : "check";
    else if (mark === "partial") status = "partial";
    else if (mark === "missing") status = "dont_have";
    else if (mark === "not_applicable") status = "not_applicable";
    else status = "not_checked";

    const limited = status === "partial" || status === "dont_have" || status === "not_checked";
    return {
      key: item.key,
      label: item.label,
      why: item.why,
      status,
      mark,
      documents: related.map((d) => ({ id: d.id, name: d.original_filename })),
      limitation: limited ? item.limitation : null,
    };
  });
}

/** Compact text for the chat assistant, so it doesn't ask for what it already has. */
export function describeEvidence(checklist: ChecklistItem[], docs: Pick<ChecklistDoc, "document_type">[]): string {
  const lines: string[] = [];
  if (docs.length) {
    lines.push(`- Documents uploaded (${docs.length}): ${docs.map((d) => documentTypeLabel(d.document_type).toLowerCase()).join(", ")}`);
  }
  const none = checklist.filter((i) => i.status === "dont_have").map((i) => i.label.toLowerCase());
  if (none.length) lines.push(`- Borrower says they do not have: ${none.join("; ")}`);
  const na = checklist.filter((i) => i.status === "not_applicable").map((i) => i.label.toLowerCase());
  if (na.length) lines.push(`- Does not apply: ${na.join("; ")}`);
  return lines.join("\n");
}
