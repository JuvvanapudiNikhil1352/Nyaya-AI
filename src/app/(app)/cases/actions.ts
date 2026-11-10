"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { RateLimitError } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createCaseSchema, updateCaseSchema } from "@/lib/validation/cases";
import { createCase, deleteCase, updateCase } from "@/modules/cases/repository";

export type CaseFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  values?: Record<string, string | undefined>;
};

function formValues(formData: FormData, keys: string[]) {
  return Object.fromEntries(
    keys.map((k) => [k, typeof formData.get(k) === "string" ? (formData.get(k) as string) : undefined]),
  );
}

function errorMessage(e: unknown) {
  if (e instanceof RateLimitError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

export async function createCaseAction(_prev: CaseFormState, formData: FormData): Promise<CaseFormState> {
  await requireUser();
  const values = formValues(formData, ["case_title", "state", "lender_type", "problem_description"]);
  const parsed = createCaseSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  let id: string;
  try {
    id = (await createCase(await createClient(), parsed.data)).id;
  } catch (e) {
    return { error: errorMessage(e), values };
  }
  revalidatePath("/dashboard");
  redirect(`/cases/${id}`);
}

export async function updateCaseAction(
  caseId: string,
  _prev: CaseFormState,
  formData: FormData,
): Promise<CaseFormState> {
  await requireUser();
  const values = formValues(formData, ["case_title", "state", "lender_type", "problem_description"]);
  const parsed = updateCaseSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  try {
    const updated = await updateCase(await createClient(), caseId, parsed.data);
    if (!updated) return { error: "Case not found." };
  } catch (e) {
    return { error: errorMessage(e), values };
  }
  revalidatePath(`/cases/${caseId}`, "layout");
  return { success: "Case details saved." };
}

export async function setCaseClosedAction(caseId: string, closed: boolean): Promise<{ error?: string }> {
  await requireUser();
  try {
    const updated = await updateCase(await createClient(), caseId, { closed });
    if (!updated) return { error: "Case not found." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/cases/${caseId}`, "layout");
  return {};
}

export async function deleteCaseAction(caseId: string): Promise<{ error?: string }> {
  await requireUser();
  try {
    const ok = await deleteCase(await createClient(), caseId);
    if (!ok) return { error: "Case not found." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/dashboard");
  redirect("/cases");
}
