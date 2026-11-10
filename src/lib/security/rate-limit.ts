import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Per-user limits. Window in seconds. */
export const RATE_LIMITS = {
  "case:create": { max: 20, windowSeconds: 3600 },
  "case:update": { max: 120, windowSeconds: 3600 },
  "case:delete": { max: 30, windowSeconds: 3600 },
  "profile:update": { max: 30, windowSeconds: 3600 },
  // AI chat: protects the free Gemini quota and stops runaway usage.
  "chat:message": { max: 20, windowSeconds: 600 },
  "chat:daily": { max: 150, windowSeconds: 86400 },
  "facts:update": { max: 300, windowSeconds: 3600 },
  "document:upload": { max: 30, windowSeconds: 3600 },
  "document:update": { max: 120, windowSeconds: 3600 },
  // Reading a document uses the small free Gemini quota.
  "document:read": { max: 10, windowSeconds: 3600 },
  "document:read_daily": { max: 25, windowSeconds: 86400 },
  "analysis:run": { max: 30, windowSeconds: 3600 },
  // Legal assessment: one AI call plus a few embedding calls each.
  "legal:assess": { max: 10, windowSeconds: 3600 },
  "legal:daily": { max: 30, windowSeconds: 86400 },
  "plan:update": { max: 200, windowSeconds: 3600 },
  "account:delete": { max: 5, windowSeconds: 3600 },
} as const;
export type RateLimitBucket = keyof typeof RATE_LIMITS;

export class RateLimitError extends Error {
  constructor() {
    super("You're doing that too often. Please wait a while and try again.");
    this.name = "RateLimitError";
  }
}

/**
 * Records one use of `bucket` for the logged-in user and throws RateLimitError
 * when the limit is reached. Fails closed: if the check itself fails, the action is refused.
 */
export async function enforceRateLimit(supabase: SupabaseClient, bucket: RateLimitBucket) {
  const { max, windowSeconds } = RATE_LIMITS[bucket];
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[rate-limit] check failed", { bucket, code: error.code });
    throw new Error("Could not verify request limits. Please try again.");
  }
  if (data !== true) throw new RateLimitError();
}
