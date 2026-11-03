// ---------------------------------------------------------------------------
// Meta Accounts option vocabulary — the PURE, db-free pieces, so "use client"
// UI (the Manage options color picker) can import them without dragging
// lib/db into the browser bundle. lib/metaAccountOptions.ts re-exports these,
// so server callers keep importing from there unchanged.
// ---------------------------------------------------------------------------

/**
 * Chip color tokens. Kept in lockstep with the class maps in
 * components/meta-accounts/presentation.ts — Tailwind can't purge dynamically
 * built class strings, so both sides enumerate a fixed palette.
 */
export const OPTION_COLOR_TOKENS = [
  "slate",
  "gray",
  "sky",
  "blue",
  "indigo",
  "violet",
  "teal",
  "emerald",
  "amber",
  "orange",
  "red",
  "pink",
] as const;

export type OptionColor = (typeof OPTION_COLOR_TOKENS)[number];
