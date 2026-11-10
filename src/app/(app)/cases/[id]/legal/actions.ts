"use server";

import { revalidatePath } from "next/cache";
import { AIConfigError, AIUnavailableError } from "@/lib/ai/llm";
import { requireUser } from "@/lib/auth";
import { RateLimitError } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getCase } from "@/modules/cases/repository";
import { LegalAssessmentError, runLegalAssessment } from "@/modules/legal/repository";

export async function runLegalAssessmentAction(caseId: string): Promise<{ error?: string }> {
  try {
    await requireUser();
    const supabase = await createClient();
    const c = await getCase(supabase, caseId);
    if (!c) return { error: "Case not found." };
    if (c.case_status === "closed") return { error: "This case is closed. Reopen it first." };
    await runLegalAssessment(supabase, c);
    revalidatePath(`/cases/${caseId}`, "layout");
    return {};
  } catch (e) {
    if (e instanceof LegalAssessmentError || e instanceof RateLimitError || e instanceof AIUnavailableError) return { error: e.message };
    if (e instanceof AIConfigError) {
      console.error("[legal] AI configuration problem:", e.message);
      return { error: "The legal assessment is not set up correctly yet." };
    }
    console.error("[legal] assessment failed", e instanceof Error ? e.message : "unknown");
    return { error: "Something went wrong. Please try again." };
  }
}
