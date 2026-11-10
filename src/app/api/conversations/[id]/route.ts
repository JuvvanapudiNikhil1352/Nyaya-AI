import type { NextRequest } from "next/server";
import { authenticate, handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/cases";
import { listMessages } from "@/modules/conversation/service";

/** GET /api/conversations/[id] — the conversation's messages (owner only, via RLS). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/conversations/[id]">) {
  const user = await authenticate();
  if (user instanceof Response) return user;
  try {
    const { id } = await ctx.params;
    if (!uuidSchema.safeParse(id).success) return jsonError(404, "Conversation not found.");

    const supabase = await createClient();
    const { data: conv, error } = await supabase
      .from("conversations")
      .select("id, case_id, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("db");
    if (!conv) return jsonError(404, "Conversation not found.");

    const messages = await listMessages(supabase, id);
    return jsonOk({ conversation: conv, messages });
  } catch (e) {
    return handleRouteError(e);
  }
}
