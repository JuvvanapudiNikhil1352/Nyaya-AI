import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Clock, FolderOpen, Phone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CaseCard } from "@/components/cases/case-card";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { listCases, recentActivity, type ActivityItem } from "@/modules/cases/repository";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Welcome"
        description="Each loan dispute gets its own case. Start a new case or continue where you left off."
        actions={
          <Button asChild size="lg">
            <Link href="/cases/new">
              <Plus aria-hidden /> New case
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="active-cases">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="active-cases" className="font-medium">Active cases</h2>
            <Link href="/cases" className="text-sm text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <ActiveCases />
          </Suspense>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="recent-activity">
            <h2 id="recent-activity" className="mb-3 font-medium">Recent activity</h2>
            <Suspense fallback={<Skeleton className="h-32 w-full" />}>
              <RecentActivity />
            </Suspense>
          </section>

          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="size-4 text-destructive" aria-hidden /> Need urgent help?
              </CardTitle>
              <CardDescription>{t.safety.emergency}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </>
  );
}

async function ActiveCases() {
  await requireUser();
  const cases = await listCases(await createClient(), { limit: 6 });
  if (cases.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No active cases"
        description="Create a case and describe your situation in your own words. You don't need all the documents to start."
        action={
          <Button asChild>
            <Link href="/cases/new">Create a case</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cases.map((c) => (
        <CaseCard key={c.id} c={c} />
      ))}
    </div>
  );
}

const ACTIVITY_LABELS: Record<string, string> = {
  "cases:insert": "Case created",
  "cases:update": "Case details updated",
  "loan_details:insert": "Loan details added",
  "loan_details:update": "Loan details updated",
  "loan_details:delete": "Loan details removed",
  "repayments:insert": "Repayment added",
  "repayments:update": "Repayment updated",
  "repayments:delete": "Repayment removed",
  "charges:insert": "Charge added",
  "charges:update": "Charge updated",
  "charges:delete": "Charge removed",
  "extracted_facts:insert": "New detail recorded",
  "extracted_facts:update": "Detail updated",
  "extracted_facts:delete": "Detail removed",
  "case_parties:insert": "Party details added",
  "case_parties:update": "Party details updated",
  "case_parties:delete": "Party details removed",
};

function activityLabel(a: ActivityItem) {
  return ACTIVITY_LABELS[`${a.table_name}:${a.action}`] ?? "Case updated";
}

async function RecentActivity() {
  await requireUser();
  const items = await recentActivity(await createClient(), 8);
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0" aria-hidden />
          Nothing yet. Updates to your cases will show here.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent>
        <ul className="divide-y text-sm">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              {a.case_id ? (
                <Link href={`/cases/${a.case_id}`} className="hover:underline">
                  {activityLabel(a)}
                </Link>
              ) : (
                <span>{activityLabel(a)}</span>
              )}
              <time className="shrink-0 text-xs text-muted-foreground" dateTime={a.created_at}>
                {formatDateTime(a.created_at)}
              </time>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
