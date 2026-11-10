"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, FileImage, FileText, Loader2, RotateCw, Trash2 } from "lucide-react";
import { deleteDocumentAction, setDocumentTypeAction } from "@/app/(app)/cases/[id]/documents/actions";
import { FactStatusBadge } from "@/components/cases/fact-status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VerificationStatus } from "@/lib/case-fields";
import { cn } from "@/lib/utils";
import { DOCUMENT_TYPES } from "@/modules/documents/evidence";
import { formatFileSize } from "@/modules/documents/file-checks";
import type { DocumentFinding, DocumentRow } from "@/modules/documents/repository";
import { requestRead } from "./upload-panel";

const STATUS: Record<DocumentRow["extraction_status"], { label: string; className: string }> = {
  pending: { label: "Not read yet", className: "bg-muted text-muted-foreground border-border" },
  processing: { label: "Reading…", className: "bg-primary/10 text-primary border-primary/30" },
  completed: { label: "Read", className: "bg-success/15 text-success border-success/30" },
  needs_review: { label: "Needs your review", className: "bg-warning/20 text-warning-foreground border-warning/40 dark:text-warning" },
  failed: { label: "Couldn't read", className: "bg-destructive/10 text-destructive border-destructive/30" },
};

/** A read that has been "processing" this long probably stopped; allow retrying. */
const STALE_MS = 3 * 60_000;

export function DocumentCard({
  caseId,
  doc,
  findings,
  disabled,
}: {
  caseId: string;
  doc: DocumentRow;
  findings: DocumentFinding[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reading, setReading] = useState(false);
  const status = STATUS[doc.extraction_status];
  const Icon = doc.mime_type === "application/pdf" ? FileText : FileImage;
  // eslint-disable-next-line react-hooks/purity -- staleness only decides whether a retry button shows
  const stale = doc.extraction_status === "processing" && Date.now() - new Date(doc.updated_at).getTime() > STALE_MS;
  const canRead = !disabled && (doc.extraction_status === "pending" || doc.extraction_status === "failed" || stale);
  const busy = pending || reading;

  async function read() {
    setReading(true);
    const result = await requestRead(caseId, doc.id);
    setReading(false);
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
    router.refresh();
  }

  const act = (fn: () => Promise<{ error?: string }>, ok: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else toast.success(ok);
    });

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start gap-3">
          <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium" title={doc.original_filename}>{doc.original_filename}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(doc.size_bytes)} · uploaded {new Date(doc.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              {doc.is_handwritten ? " · handwritten" : ""}
            </p>
          </div>
          <Badge variant="outline" className={cn("font-normal", status.className)}>
            {(reading || (doc.extraction_status === "processing" && !stale)) && <Loader2 className="size-3 animate-spin" aria-hidden />}
            {reading ? "Reading…" : status.label}
          </Badge>
        </div>

        {doc.summary && <p className="text-sm">{doc.summary}</p>}
        {doc.extraction_notes && (
          <p className={cn("rounded-md px-3 py-2 text-xs", doc.extraction_status === "failed" ? "bg-destructive/5 text-destructive" : "bg-warning/10")}>
            {doc.extraction_notes}
          </p>
        )}

        {findings.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Found in this document</p>
            <ul className="divide-y rounded-md border text-sm">
              {findings.map((f, i) => (
                <li key={i} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p>
                      <span className="text-muted-foreground">{f.label}:</span> <span className="font-medium">{f.value}</span>
                    </p>
                    {f.quote && <p className="mt-0.5 text-xs italic text-muted-foreground">“{f.quote}”</p>}
                  </div>
                  <FactStatusBadge status={f.status as VerificationStatus} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/cases/${caseId}/documents/${doc.id}/file`} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> View file
            </a>
          </Button>
          {canRead && (
            <Button size="sm" variant="outline" onClick={read} disabled={busy}>
              {reading ? <Loader2 className="animate-spin" /> : <RotateCw />} {doc.extraction_status === "pending" ? "Read document" : "Try again"}
            </Button>
          )}
          <Select
            value={doc.document_type === "unknown" ? undefined : doc.document_type}
            onValueChange={(v) => act(() => setDocumentTypeAction(caseId, doc.id, v), "Document type updated.")}
            disabled={busy || disabled}
          >
            <SelectTrigger size="sm" className="w-auto min-w-44" aria-label="Document type">
              <SelectValue placeholder="What is this document?" />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" disabled={busy || disabled}>
                <Trash2 /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                <AlertDialogDescription>
                  The file is deleted permanently. Details taken from it that you haven&apos;t checked yet are removed too. Details you already confirmed are kept.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => act(() => deleteDocumentAction(caseId, doc.id), "Document deleted.")}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
