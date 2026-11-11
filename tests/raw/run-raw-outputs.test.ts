/**
 * Produces the submission's RAW OUTPUTS: runs each test case through the real
 * system, step by step, exactly as a borrower would, and writes every output
 * unedited to raw-outputs/<timestamp>/<case>/.
 *
 * Run with: npm run raw:outputs
 *
 * Flow per case (one throwaway user, deleted afterwards):
 *   1. the borrower's message is sent to the chat (real AI)
 *   2. extracted facts are saved as they are
 *   3. the summary is confirmed AS-IS (no corrections, like pressing Confirm)
 *   4. financial analysis (deterministic engine)
 *   5. legal assessment (verified sources + AI, with citation checks)
 *   6. suggested resolution path, and the action plan for that path
 * Nothing written here is edited afterwards.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import { getChatChain, getDocumentChain } from "@/lib/ai/llm";
import { createCase, getCase } from "@/modules/cases/repository";
import { addUserMessage, generateAssistantReply, getOrCreateConversation } from "@/modules/conversation/service";
import { confirmSummary, loadCaseFacts } from "@/modules/facts/repository";
import { ENGINE_VERSION } from "@/modules/financial/engine";
import { explainAnalysis } from "@/modules/financial/explain";
import { runAnalysis } from "@/modules/financial/repository";
import { runLegalAssessment } from "@/modules/legal/repository";
import { recommend, RESOLUTION_OPTIONS } from "@/modules/resolution/plan";
import { loadPlanContext, selectResolution } from "@/modules/resolution/repository";
import { adminClient, createTestUser, deleteTestUser, hasSupabase, type TestUser } from "../integration/helpers";
import { RAW_CASES } from "./cases";

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const ROOT = new URL(`../../raw-outputs/${stamp}/`, import.meta.url);

const write = (dir: URL, name: string, content: unknown) =>
  writeFileSync(new URL(name, dir), typeof content === "string" ? content : JSON.stringify(content, null, 2) + "\n", "utf8");

/** Runs one step; on failure records the error instead of hiding it. */
async function step<T>(dir: URL, name: string, fn: () => Promise<T>): Promise<T | null> {
  const started = Date.now();
  try {
    const out = await fn();
    write(dir, `${name}.json`, { ok: true, ms: Date.now() - started, output: out });
    return out;
  } catch (e) {
    write(dir, `${name}.json`, { ok: false, ms: Date.now() - started, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
    return null;
  }
}

describe.skipIf(!hasSupabase)("Raw outputs for submission test cases", () => {
  let user: TestUser;
  beforeAll(async () => {
    user = await createTestUser("Raw Output Runner");
    mkdirSync(ROOT, { recursive: true });
    const verified = (await adminClient().from("legal_sources").select("title, document_version, verified_by, verified_at").eq("verification_status", "verified")).data;
    let commit = "unknown";
    try {
      commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    } catch {}
    write(ROOT, "run-info.json", {
      generated_at: new Date().toISOString(),
      git_commit: commit,
      calculation_engine_version: ENGINE_VERSION,
      chat_model_chain: getChatChain().map((e) => `${e.provider}:${e.model}`),
      document_model_chain: getDocumentChain().map((e) => `${e.provider}:${e.model}`),
      verified_legal_sources: verified,
      cases: RAW_CASES.map((c) => ({ id: c.id, title: c.title, state: c.state })),
      method:
        "Each borrower message was sent once to the chat as the first message of a new case. The case summary was then confirmed exactly as extracted (no user corrections), followed by the financial analysis, legal assessment, suggested resolution path and the action plan for that path. Files are written by the program and not edited.",
    });
  });
  afterAll(async () => {
    await deleteTestUser(user);
  });

  for (const tc of RAW_CASES) {
    it(tc.id, async () => {
      const dir = new URL(`${tc.id}/`, ROOT);
      mkdirSync(dir, { recursive: true });
      write(dir, "00-input.txt", tc.message + "\n");
      const db = user.client;

      const c0 = await createCase(db, { state: tc.state, lender_type: "individual", case_title: tc.title.slice(0, 100) });
      const conv = await getOrCreateConversation(db, c0.id);

      const chat = await step(dir, "01-chat", async () => {
        const userMessage = await addUserMessage(db, c0, conv, tc.message);
        const reply = await generateAssistantReply(db, (await getCase(db, c0.id))!, conv);
        return { user_message_as_stored: userMessage.content, assistant_reply: reply.message.content, assistant_metadata: reply.message.metadata, facts_changed: reply.factsChanged };
      });

      const facts = await step(dir, "02-extracted-facts", async () => {
        const f = await loadCaseFacts(db, c0.id);
        return { facts: f.facts, repayments: f.repayments, charges: f.charges, missing_information: f.missing, has_disputes: f.hasDisputes };
      });

      await step(dir, "03-confirm-summary", async () => {
        const res = await confirmSummary(db, (await getCase(db, c0.id))!);
        return { confirmed: true, missing_information_at_confirmation: res.missing, loan_details: (await db.from("loan_details").select("*").eq("case_id", c0.id).single()).data };
      });

      const analysis = await step(dir, "04-financial-analysis", async () => {
        const r = await runAnalysis(db, (await getCase(db, c0.id))!);
        return { plain_language_explanation: explainAnalysis(r), result: r };
      });

      const legal = await step(dir, "05-legal-assessment", async () => runLegalAssessment(db, (await getCase(db, c0.id))!));

      const plan = await step(dir, "06-resolution-and-action-plan", async () => {
        const c = (await getCase(db, c0.id))!;
        const ctx = await loadPlanContext(db, c);
        const rec = recommend(ctx);
        const chosen = await selectResolution(db, c, rec.recommended);
        return {
          options_presented: Object.values(RESOLUTION_OPTIONS),
          suggestion: rec,
          path_chosen_for_this_run: rec.recommended,
          action_plan_steps: chosen.steps,
        };
      });

      // A readable transcript, generated from the same outputs (not edited).
      const a = analysis?.result;
      const lines = [
        `# ${tc.title}`,
        "",
        `State: ${tc.state === "AP" ? "Andhra Pradesh" : "Telangana"} · generated ${new Date().toISOString()} · unedited`,
        "",
        "## 1. Borrower's message",
        "",
        tc.message,
        "",
        "## 2. Nyaya AI chat reply",
        "",
        chat ? chat.assistant_reply : "(chat step failed — see 01-chat.json)",
        "",
        "## 3. Facts extracted from the message",
        "",
        ...(facts
          ? [
              ...Object.values(facts.facts).map((f) => `- ${f!.field}: ${JSON.stringify(f!.value)} (${f!.status}${f!.approximate ? ", approximate" : ""})${f!.quote ? ` — "${f!.quote}"` : ""}`),
              ...facts.repayments.map((r) => `- repayment: ${r.amount} on ${r.repayment_date ?? "unknown date"} by ${r.payment_method}`),
              ...facts.charges.map((ch) => `- charge: ${ch.amount ?? "amount unknown"} (${ch.charge_type}, written basis: ${ch.has_written_basis})`),
              "",
              `Missing: ${facts.missing_information.map((m) => m.label + (m.required ? " (needed)" : "")).join("; ") || "none"}`,
            ]
          : ["(see 02-extracted-facts.json)"]),
        "",
        "## 4. Financial analysis",
        "",
        ...(analysis ? analysis.plain_language_explanation.map((l) => `- ${l}`) : ["(see 04-financial-analysis.json)"]),
        ...(a && a.scenarios.length
          ? ["", "| Method | Interest | Balance | Demand minus balance |", "|---|---|---|---|", ...a.scenarios.map((s) => `| ${s.label} | ${s.totalInterest} | ${s.balance} | ${s.discrepancy ?? "—"} |`)]
          : []),
        ...(a ? ["", "Assumptions:", ...a.assumptions.map((x) => `- ${x}`), ...(a.warnings.length ? ["", "Warnings:", ...a.warnings.map((x) => `- ${x}`)] : [])] : []),
        "",
        "## 5. Legal assessment",
        "",
        ...(legal
          ? [
              legal.summary,
              "",
              ...legal.points.flatMap((p) => [`### ${p.title} (${p.kind})`, p.explanation, `Sources: ${p.citations.map((l) => { const s = legal.passages.find((x) => x.label === l); return s ? `${s.sourceTitle}, ${s.sectionReference}` : l; }).join("; ")}`, ""]),
              `Facts that would change the picture: ${legal.factsNeeded.join("; ") || "none listed"}`,
              `Professional help recommended: ${legal.lawyer.recommended ? "yes — " + legal.lawyer.reasons.join(" ") : "no"}`,
              `Not covered by verified sources: ${legal.notCovered.join("; ") || "none"}`,
              `AI points removed by the citation checks: ${legal.removed.length ? legal.removed.map((r) => `"${r.title}" (${r.reason})`).join("; ") : "none"}`,
              `Automatic corrections: ${legal.corrections.length ? legal.corrections.join(" ") : "none"}`,
            ]
          : ["(legal step failed — see 05-legal-assessment.json)"]),
        "",
        "## 6. Suggested path and action plan",
        "",
        ...(plan
          ? [
              ...plan.suggestion.alerts.map((x) => `> ${x}`),
              "",
              `Suggested: **${RESOLUTION_OPTIONS[plan.suggestion.recommended].title}**`,
              ...plan.suggestion.reasons.map((r) => `- ${r}`),
              "",
              ...plan.action_plan_steps.map((s, i) => `${i + 1}. **${s.title}** — ${s.detail}`),
            ]
          : ["(see 06-resolution-and-action-plan.json)"]),
        "",
      ];
      write(dir, "transcript.md", lines.join("\n"));
    });
  }
});
