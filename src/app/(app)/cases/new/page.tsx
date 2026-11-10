import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewCaseForm } from "@/components/cases/new-case-form";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "New case" };

export default function NewCasePage() {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Start a new case"
        description="Just the basics for now. You'll add details by chatting and uploading documents in the next steps."
      />
      <Card>
        <CardHeader>
          <CardTitle>About your loan dispute</CardTitle>
          <CardDescription>You can change any of this later.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewCaseForm />
        </CardContent>
      </Card>
    </div>
  );
}
