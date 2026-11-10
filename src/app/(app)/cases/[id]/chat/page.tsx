import type { Metadata } from "next";
import { ChatPanel } from "@/components/chat/chat-panel";
import { FormMessage } from "@/components/auth/form-message";
import { FactsPanel } from "@/components/facts/facts-panel";
import { isAIConfigured } from "@/lib/ai/llm";
import { createClient } from "@/lib/supabase/server";
import { loadOwnedCase } from "@/modules/cases/queries";
import { getOrCreateConversation, listMessages } from "@/modules/conversation/service";
import { loadCaseFacts } from "@/modules/facts/repository";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage({ params }: PageProps<"/cases/[id]/chat">) {
  const c = await loadOwnedCase((await params).id);
  const supabase = await createClient();
  const conversationId = await getOrCreateConversation(supabase, c.id);
  const [messages, facts] = await Promise.all([listMessages(supabase, conversationId), loadCaseFacts(supabase, c.id)]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        {isAIConfigured() ? (
          <ChatPanel
            caseId={c.id}
            initialMessages={messages}
            prefill={c.problem_description ?? ""}
            caseSafetyConcern={c.safety_concern}
            closed={c.case_status === "closed"}
          />
        ) : (
          <FormMessage type="error">
            The AI assistant is not configured. Add GROQ_API_KEY and/or GEMINI_API_KEY to .env.local and restart the server.
          </FormMessage>
        )}
      </div>
      <FactsPanel data={facts} />
    </div>
  );
}
