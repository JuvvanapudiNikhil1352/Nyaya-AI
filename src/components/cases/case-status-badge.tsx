import { Badge } from "@/components/ui/badge";
import { CASE_STATUS_LABELS, type CaseStatus } from "@/types/case";
import { cn } from "@/lib/utils";

const tone: Record<CaseStatus, string> = {
  intake: "bg-info/10 text-info border-info/30",
  awaiting_confirmation: "bg-warning/20 text-warning-foreground border-warning/40 dark:text-warning",
  confirmed: "bg-accent text-accent-foreground border-brand-teal/30",
  analysed: "bg-accent text-accent-foreground border-brand-teal/30",
  resolution_selected: "bg-success/15 text-success border-success/30",
  closed: "bg-muted text-muted-foreground border-border",
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return (
    <Badge variant="outline" className={cn("font-normal", tone[status])}>
      {CASE_STATUS_LABELS[status]}
    </Badge>
  );
}
