import "server-only";
import type { z } from "zod";

/**
 * Server-only structured-output client with a chain of FREE-tier providers.
 *
 * AI_CHAT_CHAIN lists "provider:model" entries in order, e.g.
 *   groq:openai/gpt-oss-120b,gemini:gemini-3.1-flash-lite,gemini:gemini-3.5-flash
 * Each entry is tried in turn when the previous one is busy, rate-limited,
 * out of quota, times out, or returns output that fails validation.
 *
 * - API keys never leave the server.
 * - Every call has an overall time limit.
 * - Output is requested as JSON matching a schema and validated with Zod.
 */

export type Provider = "groq" | "gemini";
export type ChatTurn = { role: "user" | "assistant"; content: string };

/** All AI providers are busy / out of quota. Safe to retry later. */
export class AIUnavailableError extends Error {
  constructor(message = "The AI assistant is busy right now. Please try again in a moment.") {
    super(message);
    this.name = "AIUnavailableError";
  }
}

/** A provider refused to answer (its own content filter) and no other could. */
export class AIBlockedError extends Error {
  constructor() {
    super("The AI service could not respond to this message.");
    this.name = "AIBlockedError";
  }
}

/** Missing key or invalid chain configuration. */
export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigError";
  }
}

const DEFAULT_CHAIN =
  "groq:openai/gpt-oss-120b,gemini:gemini-3.5-flash,gemini:gemini-3.1-flash-lite,gemini:gemini-3.5-flash-lite";
const KEYS: Record<Provider, string | undefined> = {
  get groq() {
    return process.env.GROQ_API_KEY?.trim() || undefined;
  },
  get gemini() {
    return process.env.GEMINI_API_KEY?.trim() || undefined;
  },
};

export type ChainEntry = { provider: Provider; model: string };

/** Parses AI_CHAT_CHAIN and keeps only entries whose provider has a key. */
export function getChatChain(raw = process.env.AI_CHAT_CHAIN?.trim() || DEFAULT_CHAIN): ChainEntry[] {
  return parseChain(raw);
}

// Documents need a model that reads images and PDFs: Gemini only.
const DEFAULT_DOCUMENT_CHAIN = "gemini:gemini-3.5-flash,gemini:gemini-3.1-flash-lite,gemini:gemini-3.5-flash-lite";

/** Parses AI_DOCUMENT_CHAIN (Gemini entries only). */
export function getDocumentChain(raw = process.env.AI_DOCUMENT_CHAIN?.trim() || DEFAULT_DOCUMENT_CHAIN): ChainEntry[] {
  return parseChain(raw).filter((e) => e.provider === "gemini");
}

function parseChain(raw: string): ChainEntry[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(":");
      return { provider: s.slice(0, i) as Provider, model: s.slice(i + 1) };
    })
    .filter((e) => (e.provider === "groq" || e.provider === "gemini") && e.model && KEYS[e.provider]);
}

export function isAIConfigured() {
  return getChatChain().length > 0;
}

type GenerateJsonOptions<T> = {
  system: string;
  messages: ChatTurn[];
  /** JSON Schema for the output (object, all properties required, no extras). */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  validate: z.ZodType<T>;
  temperature?: number;
  maxOutputTokens?: number;
  /** Overall time budget across all attempts. */
  timeoutMs?: number;
  /** Time limit for one attempt (default 30 s). */
  attemptTimeoutMs?: number;
  /** Files (image/PDF) sent with the last user message. Gemini only. */
  files?: { mimeType: string; base64: string }[];
  /** Overrides AI_CHAT_CHAIN, e.g. getDocumentChain(). */
  chain?: ChainEntry[];
};

export type GenerateJsonResult<T> = {
  data: T;
  provider: Provider;
  model: string;
  usedFallback: boolean;
  attempts: number;
  latencyMs: number;
};

type AttemptOutcome =
  | { kind: "ok"; text: string }
  | { kind: "retry"; reason: string } // try again / next entry
  | { kind: "skip"; reason: string } // this entry is out of quota: go to next
  | { kind: "blocked" }
  | { kind: "config"; reason: string };

const RETRYABLE_STATUS = new Set([408, 409, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<GenerateJsonResult<T>> {
  const chain = opts.chain ?? getChatChain();
  if (chain.length === 0) throw new AIConfigError("No AI provider is configured (set GROQ_API_KEY and/or GEMINI_API_KEY).");

  const started = Date.now();
  const deadline = started + (opts.timeoutMs ?? 45_000);
  let attempts = 0;
  let lastReason = "unknown";
  let blocked = false;

  for (const [index, entry] of chain.entries()) {
    // Up to 2 tries per entry (second only for transient errors).
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      const remaining = deadline - Date.now();
      if (remaining < 2_000) break;
      if (tryNo > 0) await sleep(1_000);
      attempts++;

      const outcome = await attempt(entry, opts, Math.min(remaining, opts.attemptTimeoutMs ?? 30_000));
      if (outcome.kind === "ok") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(outcome.text);
        } catch {
          lastReason = "invalid_json";
          continue;
        }
        const valid = opts.validate.safeParse(parsed);
        if (!valid.success) {
          lastReason = "schema_mismatch";
          continue;
        }
        return {
          data: valid.data,
          provider: entry.provider,
          model: entry.model,
          usedFallback: index > 0,
          attempts,
          latencyMs: Date.now() - started,
        };
      }
      if (outcome.kind === "config") {
        console.error("[ai] request rejected", { provider: entry.provider, model: entry.model, reason: outcome.reason });
        lastReason = outcome.reason;
        break; // next entry
      }
      if (outcome.kind === "blocked") {
        blocked = true;
        break;
      }
      lastReason = outcome.reason;
      if (outcome.kind === "skip") {
        console.warn("[ai] quota or rate limit reached", { provider: entry.provider, model: entry.model });
        break;
      }
    }
  }

  console.warn("[ai] all attempts failed", { attempts, lastReason, ms: Date.now() - started });
  if (blocked) throw new AIBlockedError();
  throw new AIUnavailableError();
}

async function attempt<T>(entry: ChainEntry, opts: GenerateJsonOptions<T>, timeoutMs: number): Promise<AttemptOutcome> {
  const key = KEYS[entry.provider]!;
  try {
    return entry.provider === "groq"
      ? await callGroq(entry.model, key, opts, timeoutMs)
      : await callGemini(entry.model, key, opts, timeoutMs);
  } catch (e) {
    return { kind: "retry", reason: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network" };
  }
}

function statusOutcome(status: number): AttemptOutcome {
  if (status === 429) return { kind: "skip", reason: "http_429" };
  if (RETRYABLE_STATUS.has(status)) return { kind: "retry", reason: `http_${status}` };
  return { kind: "config", reason: `http_${status}` };
}

/** Groq — OpenAI-compatible Chat Completions with strict JSON schema. */
async function callGroq<T>(model: string, key: string, opts: GenerateJsonOptions<T>, timeoutMs: number): Promise<AttemptOutcome> {
  if (opts.files?.length) return { kind: "config", reason: "files_unsupported" };
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: opts.system }, ...opts.messages],
      temperature: opts.temperature ?? 0.3,
      max_completion_tokens: opts.maxOutputTokens ?? 2048,
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.schemaName, strict: true, schema: opts.jsonSchema },
      },
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low", include_reasoning: false } : {}),
    }),
  });
  if (!res.ok) return statusOutcome(res.status);
  const json = await res.json();
  const choice = json.choices?.[0];
  if (choice?.finish_reason === "content_filter") return { kind: "blocked" };
  const text = choice?.message?.content;
  if (typeof text !== "string") return { kind: "retry", reason: "empty" };
  return { kind: "ok", text };
}

/** Google Gemini — generateContent with responseJsonSchema. */
async function callGemini<T>(model: string, key: string, opts: GenerateJsonOptions<T>, timeoutMs: number): Promise<AttemptOutcome> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: opts.messages.map((m, i) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [
            // Files go with the last message, before its text (recommended for documents).
            ...(i === opts.messages.length - 1 ? (opts.files ?? []).map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } })) : []),
            { text: m.content },
          ],
        })),
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: opts.jsonSchema,
          temperature: opts.temperature ?? 0.3,
          maxOutputTokens: opts.maxOutputTokens ?? 2048,
          thinkingConfig: { thinkingLevel: "low" },
        },
      }),
    },
  );
  if (!res.ok) return statusOutcome(res.status);
  const json = await res.json();
  const candidate = json.candidates?.[0];
  const finish: string | undefined = candidate?.finishReason;
  if (json.promptFeedback?.blockReason || finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST") {
    return { kind: "blocked" };
  }
  const text = (candidate?.content?.parts ?? [])
    .filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === "string")
    .map((p: { text: string }) => p.text)
    .join("");
  if (!text) return { kind: "retry", reason: finish === "MAX_TOKENS" ? "max_tokens" : "empty" };
  return { kind: "ok", text };
}
