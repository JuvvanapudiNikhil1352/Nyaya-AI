"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { RateLimitError } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getCase } from "@/modules/cases/repository";
import { isResolutionType } from "@/modules/resolution/plan";
import { ResolutionError, selectResolution, setStepDone } from "@/modules/resolution/repository";

async function ownedCase(caseId: string) {
  await requireUser();
  const supabase = await createClient();
  const c = await getCase(supabase, caseId);
  if (!c) throw new ResolutionError("Case not found.");
  if (c.case_status === "closed") throw new ResolutionError("This case is closed. Reopen it first.");
  return { supabase, c };
}

async function run(caseId: string, fn: () => Promise<void>): Promise<{ error?: string }> {
  try {
    await fn();
    revalidatePath(`/cases/${caseId}`, "layout");
    return {};
  } catch (e) {
    if (e instanceof ResolutionError || e instanceof RateLimitError) return { error: e.message };
    console.error("[resolution] action failed", e instanceof Error ? e.message : "unknown");
    return { error: "Something went wrong. Please try again." };
  }
}

export async function chooseResolutionAction(caseId: string, type: string) {
  return run(caseId, async () => {
    if (!isResolutionType(type)) throw new ResolutionError("Choose one of the options.");
    const { supabase, c } = await ownedCase(caseId);
    await selectResolution(supabase, c, type);
  });
}

export async function toggleStepAction(caseId: string, planId: string, stepId: string, done: boolean) {
  return run(caseId, async () => {
    if (!z.uuid().safeParse(planId).success || !/^[a-z-]{1,40}$/.test(stepId)) throw new ResolutionError("Step not found.");
    const { supabase, c } = await ownedCase(caseId);
    await setStepDone(supabase, c, planId, stepId, done);
  });
}
