import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { History, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { listCases } from "@/modules/cases/repository";
import { STATE_LABELS } from "@/types/case";

export const metadata: Metadata = { title: "Case history" };

export default function CaseHistoryPage() {
  return (
    <>
      <PageHeader
        title="Case history"
        description="All your cases, including closed ones. Open a case to see its summary, analysis and documents."
        actions={
          <Button asChild>
            <Link href="/cases/new">
              <Plus aria-hidden /> New case
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-60 w-full" />}>
        <CaseTable />
      </Suspense>
    </>
  );
}

async function CaseTable() {
  await requireUser();
  const cases = await listCases(await createClient(), { includeClosed: true, limit: 200 });

  if (cases.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No cases yet"
        description="When you create a case, it will appear here with its status and last update."
        action={
          <Button asChild>
            <Link href="/cases/new">Create a case</Link>
          </Button>
        }
      />
    );
  }

  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">State</TableHead>
              <TableHead className="hidden md:table-cell">Created</TableHead>
              <TableHead className="hidden md:table-cell">Last updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="max-w-[16rem] font-medium">
                  <Link href={`/cases/${c.id}`} className="line-clamp-2 whitespace-normal hover:underline">
                    {c.case_title}
                  </Link>
                </TableCell>
                <TableCell>
                  <CaseStatusBadge status={c.case_status} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">{c.state ? STATE_LABELS[c.state] : "—"}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(c.created_at)}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(c.updated_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
