"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, Info, Loader2 } from "lucide-react";
import { setEvidenceMarkAction } from "@/app/(app)/cases/[id]/documents/actions";
import { CaseLink } from "@/components/cases/case-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CHECKLIST_STATUS_LABELS, EVIDENCE_MARKS, type ChecklistItem, type ChecklistStatus } from "@/modules/documents/evidence";

const STATUS_STYLE: Record<ChecklistStatus, string> = {
  uploaded: "bg-success/15 text-success border-success/30",
  check: "bg-warning/20 text-warning-foreground border-warning/40 dark:text-warning",
  partial: "bg-warning/20 text-warning-foreground border-warning/40 dark:text-warning",
  dont_have: "bg-muted text-muted-foreground border-border",
  not_applicable: "bg-muted text-muted-foreground border-border",
  not_checked: "bg-muted text-muted-foreground border-border",
};

export function EvidenceChecklist({ caseId, items, disabled }: { caseId: string; items: ChecklistItem[]; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const limited = items.filter((i) => i.limitation);

  const mark = (key: string, value: string) =>
    start(async () => {
      const res = await setEvidenceMarkAction(caseId, key, value);
      if (res.error) toast.error(res.error);
    });

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">Evidence checklist</CardTitle>
        <CardDescription>Updated as you upload. Tell us if you don&apos;t have something — that&apos;s fine.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y text-sm">
          {items.map((item) => (
            <li key={item.key} className="space-y-1.5 py-3 first:pt-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{item.label}</p>
                <Badge variant="outline" className={cn("shrink-0 font-normal", STATUS_STYLE[item.status])}>
                  {CHECKLIST_STATUS_LABELS[item.status]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{item.why}</p>
              {item.documents.length > 0 && (
                <p className="truncate text-xs text-muted-foreground" title={item.documents.map((d) => d.name).join(", ")}>
                  From: {item.documents.map((d) => d.name).join(", ")}
                </p>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="-ml-2 h-7 px-2 text-xs" disabled={pending || disabled}>
                    {pending ? <Loader2 className="animate-spin" /> : null}
                    {item.mark ? EVIDENCE_MARKS.find((m) => m.value === item.mark)?.label : "Tell us about this"}
                    <ChevronDown aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {EVIDENCE_MARKS.map((m) => (
                    <DropdownMenuItem key={m.value} onSelect={() => mark(item.key, m.value)}>
                      {m.label}
                    </DropdownMenuItem>
                  ))}
                  {item.mark && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => mark(item.key, "")}>Clear my answer</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>

        {limited.length > 0 && (
          <div className="rounded-lg bg-muted/60 p-3 text-xs">
            <p className="mb-1.5 flex items-center gap-1.5 font-medium">
              <Info className="size-3.5" aria-hidden /> You can continue without these
            </p>
            <p className="mb-2 text-muted-foreground">Missing documents never stop you. They only limit what can be shown:</p>
            <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
              {limited.map((i) => (
                <li key={i.key}>
                  <span className="text-foreground">{i.label}:</span> {i.limitation}
                </li>
              ))}
            </ul>
            <CaseLink segment="summary" className="mt-3 inline-block font-medium text-foreground underline">
              Continue to the Case summary →
            </CaseLink>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
