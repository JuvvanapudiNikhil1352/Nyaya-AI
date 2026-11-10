/**
 * Checks on uploaded files. Pure functions (no server imports) so they can be unit-tested.
 * The file type is decided from the file's first bytes, never from its name
 * or the type the browser claims.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // matches the storage bucket and DB limit
export const MAX_DOCUMENTS_PER_CASE = 25;

export const ALLOWED_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;
export type AllowedMime = keyof typeof ALLOWED_TYPES;

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) =>
  bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

/** Detects PDF, JPEG or PNG from the file contents. Returns null for anything else. */
export function sniffMimeType(bytes: Uint8Array): AllowedMime | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}

/**
 * Makes a file name safe to store and display: no folders, control characters
 * or odd characters, at most 120 characters, and never empty.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  if (!cleaned) return "document";
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 6 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 120 - ext.length) + ext;
}

export type FileCheck = { ok: true; mimeType: AllowedMime; extension: string } | { ok: false; error: string };

export function checkUpload(bytes: Uint8Array): FileCheck {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: "The file is larger than 10 MB." };
  const mimeType = sniffMimeType(bytes);
  if (!mimeType) return { ok: false, error: "Only PDF, JPG and PNG files can be uploaded." };
  return { ok: true, mimeType, extension: ALLOWED_TYPES[mimeType] };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
