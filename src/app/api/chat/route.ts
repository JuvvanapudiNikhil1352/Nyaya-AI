import type { NextRequest } from "next/server";
import { z } from "zod";
import { AIConfigError, AIUnavailableError, isAIConfigured } from "@/lib/ai/llm";
import { authenticate, checkMutationRequest, handleRouteError, jsonError, jsonOk, parseBody } from "@/lib/api/http";
import { createClient } from "@/lib/supabase/server";
import {
  addUserMessage,
  ChatError,
  generateAssistantReply,
  getOrCreateConversation,
  type ChatMessage,
} from "@/modules/conversation/service";
import { getCase } from "@/modules/cases/repository";

// Allow time for retries + fallback model on a busy free tier.
export const maxDuration = 60;

const chatSchema = z
  .object({
    case_id: z.uuid(),
    /** Omit to retry the reply to the last unanswered message. */
    message: z.string().trim().min(1, { error: "Type a message." }).max(4000, { error: "Please keep messages under 4,000 characters." }).optional(),
  })
  .strict();

/**
 * POST /api/chat
 * Saves the user's message and returns it with the assistant's reply.
 * If the AI is busy, returns 503 with `user_message` (already saved) and
 * `retryable: true`; the client retries by POSTing without `message`.
 */
export async function POST(request: NextRequest) {
  const blocked = checkMutationRequest(request);
  if (blocked) return blocked;
  const user = await authenticate();
  if (user instanceof Response) return user;

  const body = await parseBody(request, chatSchema);
  if ("response" in body) return body.response;
  if (!isAIConfigured()) return jsonError(503, "The AI assistant is not configured yet.");

  const supabase = await createClient();
  let userMessage: ChatMessage | undefined;
  try {
    const c = await getCase(supabase, body.data.case_id);
    if (!c) return jsonError(404, "Case not found.");
    if (c.case_status === "closed") return jsonError(409, "This case is closed. Reopen it to continue the conversation.");

    const conversationId = await getOrCreateConversation(supabase, c.id);
    if (body.data.message) {
      userMessage = await addUserMessage(supabase, c, conversationId, body.data.message);
    }
    const { message: assistantMessage, factsChanged } = await generateAssistantReply(supabase, c, conversationId);
    return jsonOk({ conversation_id: conversationId, user_message: userMessage ?? null, assistant_message: assistantMessage, facts_changed: factsChanged });
  } catch (e) {
    if (e instanceof AIUnavailableError) {
      return jsonOk({ error: e.message, retryable: true, user_message: userMessage ?? null }, 503);
    }
    if (e instanceof AIConfigError) {
      console.error("[chat] AI configuration problem:", e.message);
      return jsonError(503, "The AI assistant is not set up correctly. Please contact support.");
    }
    if (e instanceof ChatError) return jsonError(e.status, e.message);
    return handleRouteError(e);
  }
}
