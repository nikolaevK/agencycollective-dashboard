import type { MediaDocument, MediaDocType, MediaPlatform } from "@/lib/mediaDocuments";

// Pure pieces shared by the Media Buyers directory, its tiles and its (lazy)
// dialogs — no React, no Radix, so importing one doesn't drag an overlay
// into the page chunk.

// Folder color palette. Keys are stored in the DB (lib/mediaFolders.ts); the
// class strings are listed in full so Tailwind keeps them in the build. The
// color is the user's own folder label, so it only tints the folder icon and
// the picker swatch — selection/hover states stay neutral.
export const FOLDER_COLOR_KEYS = ["gray", "red", "amber", "green", "teal", "blue", "violet", "pink"] as const;
export type FolderColor = (typeof FOLDER_COLOR_KEYS)[number];

export const FOLDER_COLORS: Record<FolderColor, { icon: string; swatch: string }> = {
  gray: { icon: "text-muted-foreground", swatch: "bg-muted-foreground" },
  red: { icon: "text-red-500", swatch: "bg-red-500" },
  amber: { icon: "text-amber-500", swatch: "bg-amber-500" },
  green: { icon: "text-green-500", swatch: "bg-green-500" },
  teal: { icon: "text-teal-500", swatch: "bg-teal-500" },
  blue: { icon: "text-blue-500", swatch: "bg-blue-500" },
  violet: { icon: "text-violet-500", swatch: "bg-violet-500" },
  pink: { icon: "text-pink-500", swatch: "bg-pink-500" },
};

export function colorOf(c: string | undefined): { icon: string; swatch: string } {
  return FOLDER_COLORS[(c as FolderColor) in FOLDER_COLORS ? (c as FolderColor) : "gray"];
}

/** The important star (files + folders) — same amber star as the Client Directory's ★. */
export const IMPORTANT_STAR_CLS = "fill-amber-400 text-amber-400";

export const MAX_TAGS = 12;
export const MAX_TAG_LEN = 40;

export interface MediaFolderLite {
  name: string;
  color: string;
  important: boolean;
}

/** A document enriched by the API with this viewer's read state + total reads. */
export type DocView = MediaDocument & { ackCount: number; ackByMe: boolean };

export interface DirectoryData {
  documents: DocView[];
  folders: MediaFolderLite[];
}

export interface DocumentReader {
  adminId: string;
  adminName: string | null;
  readAt: string;
}

export const QUERY_KEY = ["media-documents"] as const;

// Local option lists (cannot import from lib/mediaDocuments at runtime — it
// pulls in the server-only DB client).
export const DOC_TYPE_OPTIONS: { value: MediaDocType; label: string }[] = [
  { value: "sop", label: "SOP" },
  { value: "creative_brief", label: "Creative Brief" },
  { value: "campaign_brief", label: "Campaign Brief" },
  { value: "account_audit", label: "Account Audit" },
  { value: "media_plan", label: "Media Plan" },
  { value: "report", label: "Report" },
  { value: "post_mortem", label: "Post-mortem" },
  { value: "other", label: "Other" },
];

export const PLATFORM_OPTIONS: { value: "" | MediaPlatform; label: string }[] = [
  { value: "", label: "No platform" },
  { value: "meta", label: "Meta" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google" },
  { value: "cross", label: "Cross-platform" },
];

export const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DOC_TYPE_OPTIONS.map((o) => [o.value, o.label])
);

export const MAX_SIZE = 10 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** SQLite datetime('now') is zone-less UTC — normalize to an explicit instant. */
function toInstant(raw: string): Date {
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.replace(" ", "T") + "Z";
  return new Date(iso);
}

export function formatDate(raw: string): string {
  return toInstant(raw).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(raw: string): string {
  return toInstant(raw).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
