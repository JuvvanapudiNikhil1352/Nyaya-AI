import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCase } from "./repository";

/**
 * Loads a case for the current page. Redirects to /login if logged out and
 * shows 404 if the case doesn't exist or belongs to another user.
 * Cached per request, so the layout and page share one database call.
 */
export const loadOwnedCase = cache(async (id: string) => {
  await requireUser();
  const found = await getCase(await createClient(), id);
  if (!found) notFound();
  return found;
});
