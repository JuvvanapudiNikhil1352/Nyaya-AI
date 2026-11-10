import { Badge } from "@/components/ui/badge";
import type { VerificationStatus } from "@/lib/case-fields";
import { cn } from "@/lib/utils";

const styles: Record<VerificationStatus, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "bg-success/15 text-success border-success/30" },
  corrected: { label: "Corrected", className: "bg-success/15 text-success border-success/30" },
  unverified: { label: "Unverified", className: "bg-warning/20 text-warning-foreground border-warning/40 dark:text-warning" },
  disputed: { label: "Disputed", className: "bg-destructive/10 text-destructive border-destructive/30" },
  missing: { label: "Missing", className: "bg-muted text-muted-foreground border-border" },
};

export function FactStatusBadge({ status }: { status: VerificationStatus }) {
  const s = styles[status];
  return (
    <Badge variant="outline" className={cn("font-normal", s.className)}>
      {s.label}
    </Badge>
  );
}
