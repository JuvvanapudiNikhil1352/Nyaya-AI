"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { RateLimitError } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getCase } from "@/modules/cases/repository";
import { AnalysisError, runAnalysis } from "@/modules/financial/repository";

/** Runs the calculation engine on the confirmed facts. */
export async function runAnalysisAction(caseId: string): Promise<{ error?: string }> {
  try {
    await requireUser();
    const supabase = await createClient();
    const c = await getCase(supabase, caseId);
    if (!c) return { error: "Case not found." };
    if (c.case_status === "closed") return { error: "This case is closed. Reopen it first." };
    await runAnalysis(supabase, c);
    revalidatePath(`/cases/${caseId}`, "layout");
    return {};
  } catch (e) {
    if (e instanceof AnalysisError || e instanceof RateLimitError) return { error: e.message };
    console.error("[financial] analysis failed", e instanceof Error ? e.message : "unknown");
    return { error: "Something went wrong. Please try again." };
  }
}
