export const CASE_STATUSES = [
  "intake",
  "awaiting_confirmation",
  "confirmed",
  "analysed",
  "resolution_selected",
  "closed",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  intake: "Gathering information",
  awaiting_confirmation: "Waiting for your confirmation",
  confirmed: "Facts confirmed",
  analysed: "Analysis ready",
  resolution_selected: "Path chosen",
  closed: "Closed",
};

export const STATES = ["AP", "TG"] as const;
export type StateCode = (typeof STATES)[number];
export const STATE_LABELS: Record<StateCode, string> = {
  AP: "Andhra Pradesh",
  TG: "Telangana",
};

export const LENDER_TYPES = ["individual", "unsure"] as const;
export type LenderType = (typeof LENDER_TYPES)[number];
export const LENDER_TYPE_LABELS: Record<LenderType, string> = {
  individual: "Private individual / moneylender",
  unsure: "Not sure",
};

export type CaseRecord = {
  id: string;
  user_id: string;
  case_title: string;
  case_status: CaseStatus;
  state: StateCode | null;
  lender_type: LenderType | null;
  problem_description: string | null;
  safety_concern: boolean;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};
