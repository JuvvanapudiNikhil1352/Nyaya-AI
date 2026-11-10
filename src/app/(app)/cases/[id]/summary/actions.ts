"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { RateLimitError } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getCase } from "@/modules/cases/repository";
import {
  CHARGE_TYPES,
  isFactField,
  PAYMENT_METHODS,
  validateFactValue,
  WRITTEN_BASIS,
} from "@/modules/extraction/fields";
import {
  confirmFact,
  confirmSummary,
  ConfirmationError,
  deleteItem,
  markFactUnknown,
  saveCharge,
  saveRepayment,
  setFactValue,
  setItemConfirmed,
} from "@/modules/facts/repository";

export type ActionResult = { error?: string; fieldErrors?: Record<string, string>; missing?: { label: string; required: boolean }[] };

/** Loads the case as the logged-in user (RLS) and refuses closed cases. */
async function ownedCase(caseId: string) {
  await requireUser();
  const supabase = await createClient();
  const c = await getCase(supabase, caseId);
  if (!c) throw new Error("Case not found.");
  if (c.case_status === "closed") throw new Error("This case is closed. Reopen it to make changes.");
  return { supabase, c };
}

async function run(caseId: string, fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    const out = (await fn()) ?? {};
    revalidatePath(`/cases/${caseId}`, "layout");
    return out;
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof ConfirmationError) return { error: e.message };
    if (e instanceof Error && /not found|closed|no value/i.test(e.message)) return { error: e.message };
    console.error("[summary] action failed", e instanceof Error ? e.message : "unknown");
    return { error: "Something went wrong. Please try again." };
  }
}

export async function confirmFactAction(caseId: string, field: string) {
  return run(caseId, async () => {
    if (!isFactField(field)) return { error: "Unknown detail." };
    const { supabase, c } = await ownedCase(caseId);
    await confirmFact(supabase, c, field);
  });
}

export async function setFactAction(caseId: string, field: string, rawValue: string, approximate: boolean) {
  return run(caseId, async () => {
    if (!isFactField(field)) return { error: "Unknown detail." };
    const checked = validateFactValue(field, rawValue);
    if ("error" in checked) return { fieldErrors: { value: checked.error } };
    const { supabase, c } = await ownedCase(caseId);
    await setFactValue(supabase, c, field, checked.value, approximate);
  });
}

export async function markUnknownAction(caseId: string, field: string) {
  return run(caseId, async () => {
    if (!isFactField(field)) return { error: "Unknown detail." };
    const { supabase, c } = await ownedCase(caseId);
    await markFactUnknown(supabase, c, field);
  });
}

// ---------------------------------------------------------------- repayments & charges

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || !("error" in validateFactValue("borrowing_date", v)), { message: "Enter a valid date that isn't in the future." });

const repaymentForm = z.object({
  amount: z.string().refine((v) => !("error" in validateFactValue("principal_amount", v)), { message: "Enter an amount more than zero." }),
  repayment_date: optionalDate,
  date_is_approximate: z.boolean(),
  payment_method: z.enum(PAYMENT_METHODS.map((m) => m.value) as [string, ...string[]]),
  description: z.string().trim().max(500).transform((v) => v || null),
});

const chargeForm = z.object({
  amount: z
    .string()
    .trim()
    .refine((v) => v === "" || !("error" in validateFactValue("principal_amount", v)), { message: "Enter an amount more than zero, or leave empty." }),
  charge_date: optionalDate,
  charge_type: z.enum(CHARGE_TYPES.map((t) => t.value) as [string, ...string[]]),
  has_written_basis: z.enum(WRITTEN_BASIS.map((w) => w.value) as [string, ...string[]]),
  description: z.string().trim().max(500).transform((v) => v || null),
});

function firstErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  const fieldErrors = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  for (const [k, v] of Object.entries(fieldErrors)) if (v?.[0]) out[k] = v[0];
  return out;
}

const uuid = z.uuid();

export async function saveRepaymentAction(caseId: string, input: z.input<typeof repaymentForm>, id?: string) {
  return run(caseId, async () => {
    if (id && !uuid.safeParse(id).success) return { error: "Repayment not found." };
    const parsed = repaymentForm.safeParse(input);
    if (!parsed.success) return { fieldErrors: firstErrors(parsed.error) };
    const { supabase, c } = await ownedCase(caseId);
    const amount = validateFactValue("principal_amount", parsed.data.amount) as { value: number };
    await saveRepayment(supabase, c, { ...parsed.data, amount: amount.value }, id);
  });
}

export async function saveChargeAction(caseId: string, input: z.input<typeof chargeForm>, id?: string) {
  return run(caseId, async () => {
    if (id && !uuid.safeParse(id).success) return { error: "Charge not found." };
    const parsed = chargeForm.safeParse(input);
    if (!parsed.success) return { fieldErrors: firstErrors(parsed.error) };
    const { supabase, c } = await ownedCase(caseId);
    const amount = parsed.data.amount === "" ? null : (validateFactValue("principal_amount", parsed.data.amount) as { value: number }).value;
    await saveCharge(supabase, c, { ...parsed.data, amount }, id);
  });
}

export async function confirmItemAction(caseId: string, table: "repayments" | "charges", id: string) {
  return run(caseId, async () => {
    if (!["repayments", "charges"].includes(table) || !uuid.safeParse(id).success) return { error: "Item not found." };
    const { supabase, c } = await ownedCase(caseId);
    await setItemConfirmed(supabase, c, table, id);
  });
}

export async function deleteItemAction(caseId: string, table: "repayments" | "charges", id: string) {
  return run(caseId, async () => {
    if (!["repayments", "charges"].includes(table) || !uuid.safeParse(id).success) return { error: "Item not found." };
    const { supabase, c } = await ownedCase(caseId);
    await deleteItem(supabase, c, table, id);
  });
}

export async function confirmSummaryAction(caseId: string) {
  return run(caseId, async () => {
    const { supabase, c } = await ownedCase(caseId);
    const { missing } = await confirmSummary(supabase, c);
    return { missing: missing.map((m) => ({ label: m.label, required: m.required })) };
  });
}
