import {
  Calculator,
  ClipboardList,
  FilePen,
  FolderOpen,
  Gavel,
  History,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Plus,
  Route,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { t } from "@/lib/i18n";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const appNav: NavItem[] = [
  { href: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
  { href: "/cases/new", label: t.nav.newCase, icon: Plus },
  { href: "/cases", label: t.nav.caseHistory, icon: History },
  { href: "/settings", label: t.nav.settings, icon: Settings },
];

/** Case workspace tabs. `segment` is appended to /cases/[id]. */
export type CaseNavItem = { segment: string; label: string; icon: LucideIcon };

export const caseNav: CaseNavItem[] = [
  { segment: "", label: t.caseNav.overview, icon: LayoutDashboard },
  { segment: "chat", label: t.caseNav.chat, icon: MessageSquare },
  { segment: "documents", label: t.caseNav.documents, icon: FolderOpen },
  { segment: "summary", label: t.caseNav.summary, icon: ClipboardList },
  { segment: "financial", label: t.caseNav.financial, icon: Calculator },
  { segment: "legal", label: t.caseNav.legal, icon: Gavel },
  { segment: "resolution", label: t.caseNav.resolution, icon: Route },
  { segment: "action-plan", label: t.caseNav.actionPlan, icon: ListChecks },
  { segment: "drafts", label: t.caseNav.drafts, icon: FilePen },
];

export function caseHref(caseId: string, segment: string) {
  return segment ? `/cases/${caseId}/${segment}` : `/cases/${caseId}`;
}
