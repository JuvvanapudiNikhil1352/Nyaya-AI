/**
 * English UI strings.
 *
 * All shared UI labels live here so Telugu (te.ts) can be added later
 * with the same keys. Page-specific copy is migrated here progressively.
 */
export const en = {
  app: {
    name: "Nyaya AI",
    tagline: "Understand what you owe. Know your rights. Take the next step.",
  },
  nav: {
    dashboard: "Dashboard",
    newCase: "New case",
    caseHistory: "Case history",
    settings: "Settings",
    signOut: "Sign out",
    login: "Log in",
    signup: "Get started",
  },
  caseNav: {
    overview: "Overview",
    chat: "Chat",
    documents: "Documents",
    summary: "Case summary",
    financial: "Financial analysis",
    legal: "Legal assessment",
    resolution: "Resolution",
    actionPlan: "Action plan",
    drafts: "Draft documents",
  },
  disclaimer: {
    notLawyer:
      "Nyaya AI provides legal information, not legal advice. It is not a lawyer and does not represent you.",
    draft:
      "AI-generated draft. This document has not been approved by a lawyer. Review the facts and obtain professional legal advice where appropriate before using it.",
  },
  safety: {
    emergency:
      "If you or your family are being threatened or are in danger, call 112 (India emergency number) immediately.",
  },
} as const;

export type Messages = typeof en;
