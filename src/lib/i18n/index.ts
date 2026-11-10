import { en, type Messages } from "./messages/en";

export const SUPPORTED_LANGUAGES = ["en"] as const; // "te" (Telugu) planned
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const dictionaries: Record<Language, Messages> = { en };

/** Returns the UI string dictionary for a language (English fallback). */
export function getMessages(lang: string = "en"): Messages {
  return dictionaries[lang as Language] ?? en;
}

/** Default dictionary for components that don't yet know the user's language. */
export const t = en;
