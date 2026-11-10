/**
 * The loan facts Nyaya AI tries to collect for every case, in display order.
 * Shared by the chat side panel and the case summary page.
 */
export const VERIFICATION_STATUSES = [
  "unverified",
  "confirmed",
  "corrected",
  "disputed",
  "missing",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const SOURCE_TYPES = ["user_statement", "uploaded_document", "user_confirmed"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
// The evidence checklist lives in src/modules/documents/evidence.ts.
