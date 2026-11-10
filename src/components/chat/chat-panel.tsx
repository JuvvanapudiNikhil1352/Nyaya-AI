"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/modules/conversation/service";
import { SafetyBanner } from "./safety-banner";

const MAX_LEN = 4000;

const WELCOME =
  "Hello. Tell me about your loan in your own words — how much you borrowed and when, what interest was agreed, what you have repaid, and what the lender is asking for now. It's fine if you don't know everything.";

type Props = {
  caseId: string;
  initialMessages: ChatMessage[];
  prefill: string;
  caseSafetyConcern: boolean;
  closed: boolean;
};

export function ChatPanel({ caseId, initialMessages, prefill, caseSafetyConcern, closed }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState(initialMessages.length === 0 ? prefill : "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ text: string; retryable: boolean } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const awaitingReply = messages.at(-1)?.role === "user";
  const safety = caseSafetyConcern || messages.some((m) => m.metadata?.safety_concern || m.metadata?.self_harm_risk);
  const selfHarm = messages.some((m) => m.metadata?.self_harm_risk);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  async function post(message?: string) {
    setSending(true);
    setError(null);
    const tempId = `temp-${Date.now()}`;
    if (message) {
      setMessages((m) => [
        ...m,
        { id: tempId, role: "user", content: message, created_at: new Date().toISOString(), metadata: {} },
      ]);
    }
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message ? { case_id: caseId, message } : { case_id: caseId }),
      });
      const data = await res.json().catch(() => ({}));

      // Replace the optimistic message with the saved one (if it was saved).
      setMessages((m) => {
        let next = m.filter((x) => x.id !== tempId);
        if (data.user_message) next = [...next, data.user_message];
        if (data.assistant_message) next = [...next, data.assistant_message];
        return next;
      });

      // New facts were recorded: refresh the server-rendered "What we know" panel.
      if (data.facts_changed > 0) router.refresh();

      if (!res.ok) {
        if (message && !data.user_message) setInput(message); // not saved: give the text back
        setError({ text: data.error ?? "Something went wrong. Please try again.", retryable: !!data.retryable });
      }
    } catch {
      setMessages((m) => m.filter((x) => x.id !== tempId));
      if (message) setInput(message);
      setError({ text: "Could not reach the server. Check your internet connection and try again.", retryable: false });
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending || closed) return;
    setInput("");
    void post(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="space-y-4">
      {safety && <SafetyBanner selfHarm={selfHarm} />}

      <Card className="flex min-h-[60svh] flex-col gap-0 py-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite" aria-busy={sending}>
          <Bubble role="assistant" content={WELCOME} />
          {messages.map((m) => (
            <Bubble key={m.id} role={m.role} content={m.content} />
          ))}
          {sending && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Avatar />
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Nyaya AI is thinking…
              </span>
            </div>
          )}
          {error && (
            <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
              <span>{error.text}</span>
              {error.retryable && awaitingReply && (
                <Button size="sm" variant="outline" onClick={() => post()} disabled={sending}>
                  <RotateCcw aria-hidden /> Try again
                </Button>
              )}
            </div>
          )}
          {!sending && !error && awaitingReply && messages.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              The last message has no reply yet.
              <Button size="sm" variant="outline" onClick={() => post()}>
                <RotateCcw aria-hidden /> Get reply
              </Button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={onSubmit} className="border-t p-3">
          {closed ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              This case is closed. Reopen it from the Overview tab to continue.
            </p>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <Textarea
                  name="message"
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, MAX_LEN))}
                  onKeyDown={onKeyDown}
                  placeholder="Type your message…  (Enter to send, Shift+Enter for a new line)"
                  className="max-h-48 min-h-12 resize-none"
                  aria-label="Message"
                  disabled={sending}
                />
                <Button type="submit" size="icon-lg" aria-label="Send" disabled={sending || !input.trim()}>
                  {sending ? <Loader2 className="animate-spin" /> : <Send />}
                </Button>
              </div>
              <p className="mt-2 flex justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  AI can make mistakes. You will check every detail on the Case summary before any analysis.
                  Don&apos;t share Aadhaar, bank passwords or OTPs.
                </span>
                {input.length > MAX_LEN - 500 && <span className="shrink-0">{input.length}/{MAX_LEN}</span>}
              </p>
              {messages.length === 0 && prefill && input === prefill && (
                <p className="mt-1 text-xs text-muted-foreground">
                  We&apos;ve filled in the description you gave when creating the case. Edit it if you like, then send.
                </p>
              )}
            </>
          )}
        </form>
      </Card>
    </div>
  );
}

function Avatar() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <Bot className="size-4" aria-hidden />
    </span>
  );
}

function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const mine = role === "user";
  return (
    <div className={cn("flex items-start gap-3", mine && "justify-end")}>
      {!mine && <Avatar />}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap break-words",
          mine ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted",
        )}
      >
        <span className="sr-only">{mine ? "You said: " : "Nyaya AI said: "}</span>
        {content}
      </div>
    </div>
  );
}
