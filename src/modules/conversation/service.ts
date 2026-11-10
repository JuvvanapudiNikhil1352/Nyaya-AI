import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AIBlockedError, generateJson, type ChatTurn } from "@/lib/ai/llm";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import type { CaseRecord } from "@/types/case";
import { aiExtractionSchema, normaliseExtraction } from "@/modules/extraction/ai-extraction";
import { FACT_FIELDS, formatFactValue, formatINR, labelOf, PAYMENT_METHODS, formatISODate } from "@/modules/extraction/fields";
import { describeEvidence } from "@/modules/documents/evidence";
import { loadEvidence } from "@/modules/documents/repository";
import { applyExtraction, loadCaseFacts, type CaseFacts } from "@/modules/facts/repository";
import {
  buildExtractionOnlyPrompt,
  buildIntakeSystemPrompt,
  EXTRACTION_ONLY_JSON_SCHEMA,
  INTAKE_RESPONSE_JSON_SCHEMA,
} from "./prompts";
import { redactSensitive, REDACTION_NOTE, screenMessage } from "./safety";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata: { safety_concern?: boolean; self_harm_risk?: boolean; [k: string]: unknown };
};

const MESSAGE_COLUMNS = "id, role, content, created_at, metadata";
/** How much history the AI sees. Older messages are dropped first. */
const HISTORY_MAX_MESSAGES = 40;
// Kept modest: free-tier providers limit tokens per minute. Older details are
// still known to the AI through the KNOWN FACTS list in the system prompt.
const HISTORY_MAX_CHARS = 12_000;

const intakeReplySchema = aiExtractionSchema.extend({
  reply: z.string().trim().min(1).max(4000),
  safety_concern: z.boolean(),
  self_harm_risk: z.boolean(),
});

export class ChatError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ChatError";
  }
}

export async function getOrCreateConversation(supabase: SupabaseClient, caseId: string): Promise<string> {
  const existing = await supabase
    .from("conversations")
    .select("id")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw dbError("getConversation", existing.error);
  if (existing.data) return existing.data.id;

  const created = await supabase.from("conversations").insert({ case_id: caseId }).select("id").single();
  if (created.error) throw dbError("createConversation", created.error);
  return created.data.id;
}

export async function listMessages(supabase: SupabaseClient, conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw dbError("listMessages", error);
  return (data ?? []) as ChatMessage[];
}

/** Saves the borrower's message (with a deterministic safety screen). */
export async function addUserMessage(
  supabase: SupabaseClient,
  c: CaseRecord,
  conversationId: string,
  content: string,
): Promise<ChatMessage> {
  await enforceRateLimit(supabase, "chat:message");
  await enforceRateLimit(supabase, "chat:daily");

  // Remove Aadhaar/PAN/PIN/OTP etc. before the text is stored or sent to any AI.
  const { text: safeContent, redacted } = redactSensitive(content);
  const screen = screenMessage(safeContent);
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content: safeContent,
      metadata: { safety_concern: screen.concern, self_harm_risk: screen.selfHarm, screened_by: "rules", redacted },
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw dbError("addUserMessage", error);

  if (screen.concern && !c.safety_concern) await flagCaseSafety(supabase, c.id);
  return data as ChatMessage;
}

/**
 * Generates and saves the assistant's reply to the latest user message.
 * Throws AIUnavailableError (retryable) if the AI service is busy.
 */
export async function generateAssistantReply(
  supabase: SupabaseClient,
  c: CaseRecord,
  conversationId: string,
): Promise<{ message: ChatMessage; factsChanged: number }> {
  const [history, known, evidence] = await Promise.all([
    listMessages(supabase, conversationId),
    loadCaseFacts(supabase, c.id),
    loadEvidence(supabase, c.id),
  ]);
  const last = history.at(-1);
  if (!last || last.role !== "user") {
    throw new ChatError("There is no new message to reply to.", 409);
  }
  // Facts plus uploaded documents, so the assistant never asks for them again.
  const knownText = [describeKnownFacts(known), describeEvidence(evidence.checklist, evidence.documents)].filter(Boolean).join("\n");

  let reply: { content: string; metadata: ChatMessage["metadata"] };
  let extraction: ReturnType<typeof normaliseExtraction> | null = null;
  try {
    const result = await generateJson({
      system: buildIntakeSystemPrompt(c, knownText),
      messages: toModelMessages(history),
      jsonSchema: INTAKE_RESPONSE_JSON_SCHEMA,
      schemaName: "intake_reply",
      validate: intakeReplySchema,
      temperature: 0.2,
      maxOutputTokens: 3000,
    });
    extraction = normaliseExtraction(result.data, last.content);
    reply = {
      // A fixed privacy note (not AI-written) when identifiers were removed.
      content: last.metadata?.redacted ? `${REDACTION_NOTE}\n\n${result.data.reply}` : result.data.reply,
      metadata: {
        safety_concern: result.data.safety_concern,
        self_harm_risk: result.data.self_harm_risk,
        provider: result.provider,
        model: result.model,
        used_fallback: result.usedFallback,
        latency_ms: result.latencyMs,
      },
    };
  } catch (e) {
    if (!(e instanceof AIBlockedError)) throw e;
    // The AI provider refused (usually on violent content). Respond with a
    // fixed, safe message; the safety banner gives emergency contacts.
    reply = {
      content:
        "I'm sorry you're going through this. Your safety matters most. Are you and your family safe right now? When you're ready, you can tell me more about the loan.",
      metadata: { safety_concern: true, self_harm_risk: last.metadata?.self_harm_risk === true, model: "fixed-response", blocked: true },
    };
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "assistant", content: reply.content, metadata: reply.metadata })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw dbError("addAssistantMessage", error);

  if ((reply.metadata.safety_concern || reply.metadata.self_harm_risk) && !c.safety_concern) {
    await flagCaseSafety(supabase, c.id);
  }

  // Facts from the borrower's latest message. Failure here must not lose the reply.
  let factsChanged = 0;
  if (extraction && isEmptyExtraction(extraction) && looksLikeItHasFacts(last.content)) {
    // Safety net: the first pass sometimes returns nothing for a message that
    // clearly contains details. Costs one extra AI call, only in that case.
    extraction = await extractOnly(last.content, knownText);
  }
  if (extraction) {
    try {
      factsChanged = await applyExtraction(supabase, c, last.id, extraction);
    } catch (e) {
      console.error("[chat] could not save extracted facts", e instanceof Error ? e.message : "unknown");
    }
  }
  return { message: data as ChatMessage, factsChanged };
}

/** Compact text list of what is already recorded, so the AI does not re-ask. */
export function describeKnownFacts(k: CaseFacts): string {
  const lines: string[] = [];
  for (const def of FACT_FIELDS) {
    const f = k.facts[def.key];
    if (!f) continue;
    if (f.status === "missing" || f.value === null) lines.push(`- ${def.label}: borrower does not know`);
    else lines.push(`- ${def.label}: ${formatFactValue(def.key, f.value, f.approximate)}${f.status === "disputed" ? " (conflicts with an earlier answer)" : ""}`);
  }
  if (k.repayments.length) {
    const shown = k.repayments.slice(0, 12).map((r) => `${formatINR(r.amount)} ${r.repayment_date ? "on " + formatISODate(r.repayment_date, r.date_is_approximate) : "(date not given)"} by ${labelOf(PAYMENT_METHODS, r.payment_method)}`);
    lines.push(`- Repayments recorded (${k.repayments.length}): ${shown.join("; ")}${k.repayments.length > 12 ? "; …" : ""}`);
  }
  if (k.charges.length) {
    lines.push(`- Extra charges recorded: ${k.charges.length}`);
  }
  return lines.length ? lines.join("\n") : "Nothing recorded yet.";
}

/** Most recent messages that fit the history budget. */
export function toModelMessages(history: Pick<ChatMessage, "role" | "content">[]): ChatTurn[] {
  const picked: Pick<ChatMessage, "role" | "content">[] = [];
  let chars = 0;
  for (let i = history.length - 1; i >= 0 && picked.length < HISTORY_MAX_MESSAGES; i--) {
    chars += history[i].content.length;
    if (chars > HISTORY_MAX_CHARS && picked.length > 0) break;
    picked.unshift(history[i]);
  }
  // Providers expect the conversation to start with a user turn.
  while (picked.length && picked[0].role !== "user") picked.shift();
  return picked.map((m) => ({ role: m.role, content: m.content }));
}

async function flagCaseSafety(supabase: SupabaseClient, caseId: string) {
  const { error } = await supabase.from("cases").update({ safety_concern: true }).eq("id", caseId);
  if (error) console.error("[chat] could not flag safety concern", { code: error.code });
}

function dbError(where: string, error: { code?: string }) {
  console.error(`[chat] ${where} failed`, { code: error.code });
  return new Error("A database error occurred. Please try again.");
}

function isEmptyExtraction(e: ReturnType<typeof normaliseExtraction>) {
  return e.facts.length === 0 && e.repayments.length === 0 && e.charges.length === 0;
}

/** Deterministic hint that a message contains loan details: amounts, rates, months or "don't know". */
export function looksLikeItHasFacts(text: string): boolean {
  return (
    /\d[\d,]{2,}/.test(text) || // numbers with 3+ digits, e.g. 80,000
    /₹|\brs\.?\s*\d|\brupees?\b|\blakhs?\b|\bper\s*(cent|hundred)\b|%/i.test(text) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(text) ||
    /\b(don'?t|do not) know\b/i.test(text)
  );
}

/** Second pass: extraction only. Never throws — a missed extraction must not break the chat. */
async function extractOnly(message: string, knownFacts: string) {
  try {
    const result = await generateJson({
      system: buildExtractionOnlyPrompt(knownFacts),
      messages: [{ role: "user", content: message }],
      jsonSchema: EXTRACTION_ONLY_JSON_SCHEMA,
      schemaName: "extraction",
      validate: aiExtractionSchema,
      temperature: 0,
      maxOutputTokens: 2500,
      timeoutMs: 25_000,
    });
    return normaliseExtraction(result.data, message);
  } catch {
    console.warn("[chat] second-pass extraction failed");
    return null;
  }
}
