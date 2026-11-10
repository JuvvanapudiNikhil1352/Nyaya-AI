import { Suspense } from "react";
import { MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CaseNav } from "@/components/cases/case-nav";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import { loadOwnedCase } from "@/modules/cases/queries";
import { STATE_LABELS } from "@/types/case";

/** Case workspace: title, status and section tabs. */
export default function CaseLayout({ children, params }: LayoutProps<"/cases/[id]">) {
  return (
    <>
      <Suspense fallback={<Skeleton className="mb-4 h-14 w-80 max-w-full" />}>
        <CaseHeader params={params} />
      </Suspense>
      <Suspense fallback={<div className="mb-6 h-11 border-b" />}>
        <CaseNav />
      </Suspense>
      {children}
    </>
  );
}

async function CaseHeader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await loadOwnedCase(id);
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <CaseStatusBadge status={c.case_status} />
        {c.state && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden /> {STATE_LABELS[c.state]}
          </span>
        )}
      </div>
      <p className="text-xl font-semibold tracking-tight break-words">{c.case_title}</p>
    </div>
  );
}
