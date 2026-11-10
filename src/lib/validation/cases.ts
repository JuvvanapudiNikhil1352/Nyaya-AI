import { z } from "zod";
import { LENDER_TYPES, STATES } from "@/types/case";

/** Treat empty form fields as "not provided". */
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const caseTitle = z
  .string()
  .trim()
  .min(1, { error: "Enter a case name." })
  .max(120, { error: "Case name must be 120 characters or fewer." });

const problemDescription = z
  .string()
  .trim()
  .max(4000, { error: "Please keep the description under 4,000 characters." });

export const createCaseSchema = z.object({
  case_title: z.preprocess(emptyToUndefined, caseTitle.optional()),
  state: z.enum(STATES, { error: "Select your state." }),
  lender_type: z.enum(LENDER_TYPES, { error: "Select who lent you the money." }),
  problem_description: z.preprocess(emptyToUndefined, problemDescription.optional()),
});
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const updateCaseSchema = z
  .object({
    case_title: caseTitle,
    state: z.enum(STATES, { error: "Select your state." }),
    lender_type: z.enum(LENDER_TYPES, { error: "Select who lent you the money." }),
    problem_description: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      problemDescription.nullable(),
    ),
    /** true = close the case, false = reopen it */
    closed: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { error: "Nothing to update." });
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;

export const uuidSchema = z.uuid();

export function defaultCaseTitle(now = new Date()) {
  const date = now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `Loan dispute – ${date}`;
}
