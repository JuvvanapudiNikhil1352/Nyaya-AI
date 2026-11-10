import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { STATE_LABELS, type CaseRecord } from "@/types/case";
import { CaseStatusBadge } from "./case-status-badge";

export function CaseCard({ c }: { c: CaseRecord }) {
  return (
    <Link href={`/cases/${c.id}`} className="group block">
      <Card className="h-full transition-colors group-hover:border-brand-teal/60">
        <CardHeader>
          <div className="mb-1 flex items-start justify-between gap-2">
            <CaseStatusBadge status={c.case_status} />
            <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
          </div>
          <CardTitle className="line-clamp-2">{c.case_title}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {c.state && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {STATE_LABELS[c.state]}
              </span>
            )}
            <span>Updated {formatDate(c.updated_at)}</span>
          </CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
