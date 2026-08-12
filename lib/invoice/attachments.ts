// Shared limits for free-form email attachments sent alongside invoice PDFs.
// Single source of truth for BOTH the server send routes (enforcement — see
// readEmailAttachments.ts) and the client pickers (immediate UX feedback —
// see components/invoice/AttachmentPicker.tsx), so the two can never drift.
// Limits are tuned for Vercel Pro's 4.5 MB request body cap (platform-level —
// exceeded requests are rejected by Vercel before reaching the handler with a
// generic 413). Budget: 4.5 MB total = PDF (typically 0.1–0.5 MB; cap 10 MB)
// + attachments (cap 3 MB total) + form fields + multipart framing.

export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_SIZE = 3 * 1024 * 1024; // 3 MB per file
export const MAX_TOTAL_ATTACHMENT_SIZE = 3 * 1024 * 1024; // 3 MB total

// Executable-ish extensions that mail providers commonly bounce or strip;
// blocking up-front avoids a silent partial send and surfaces the issue while
// the admin still has the picker open.
export const BLOCKED_ATTACHMENT_EXTS = new Set([
  "exe", "bat", "cmd", "com", "scr", "pif", "msi", "ps1", "vbs", "vbe",
  "js", "jse", "wsf", "wsh", "hta", "jar", "app", "deb", "rpm",
]);

/**
 * Lowercased extension of a filename for the blocklist check. Trailing dots
 * and spaces are stripped FIRST — "malware.exe " and "malware.exe." must
 * resolve to "exe", not "exe " / "", because the email service's filename
 * sanitiser trims the name back to "malware.exe" on the outgoing email.
 */
export function attachmentExtension(name: string): string {
  const trimmed = name.replace(/[. ]+$/, "");
  const dot = trimmed.lastIndexOf(".");
  if (dot < 0 || dot === trimmed.length - 1) return "";
  return trimmed.slice(dot + 1).toLowerCase();
}

export function formatAttachmentBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
