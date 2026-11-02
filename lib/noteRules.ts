/**
 * Notes vocabulary + limits. Pure (no db imports) so client components can
 * use them without pulling the database client and Node crypto into the
 * browser bundle; lib/notes re-exports it.
 */

export type NotePriority = "high" | "medium" | "low";
export const NOTE_PRIORITIES: NotePriority[] = ["high", "medium", "low"];

export const NOTE_TITLE_MAX = 200;
export const NOTE_BODY_MAX = 50_000;
export const NOTE_TAG_MAX = 32;
export const NOTE_MAX_TAGS = 12;
export const NOTE_MAX_SHARES = 50;
