import { FileText, MessageSquare, UserCheck } from "lucide-react";

/** Shows where a fact came from — the borrower's own words when available. */
export function SourceNote({ sourceType, quote }: { sourceType: string; quote: string | null }) {
  if (sourceType === "user_confirmed") {
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <UserCheck className="size-3.5 shrink-0" aria-hidden /> Entered by you
      </p>
    );
  }
  const Icon = sourceType === "uploaded_document" ? FileText : MessageSquare;
  const label = sourceType === "uploaded_document" ? "From a document" : "You said in chat";
  return (
    <p className="flex items-start gap-1 text-xs text-muted-foreground">
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        {label}
        {quote && <>: <q className="italic">{quote}</q></>}
      </span>
    </p>
  );
}
