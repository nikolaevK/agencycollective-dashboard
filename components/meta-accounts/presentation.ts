import type { OptionColor } from "@/lib/metaAccountOptions";

// ---------------------------------------------------------------------------
// Meta Accounts chip presentation. Tailwind can't purge dynamically-built class
// strings, so the palette is a fixed map keyed by the color tokens enumerated
// in lib/metaAccountOptions.ts (OPTION_COLOR_TOKENS) — keep both in lockstep.
// ---------------------------------------------------------------------------

export const CHIP_BASE =
  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap";

export const FALLBACK_CHIP_CLS = "bg-muted text-muted-foreground";

/** Chip fill/text per color token (mirrors the RebillStatusChip idiom). */
export const OPTION_CHIP_CLS: Record<OptionColor, string> = {
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  gray: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  pink: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
};

/** Solid swatch (color picker dots + filter-card accents). */
export const OPTION_SWATCH_CLS: Record<OptionColor, string> = {
  slate: "bg-slate-500",
  gray: "bg-gray-500",
  sky: "bg-sky-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  pink: "bg-pink-500",
};

export function chipClass(color: string | undefined): string {
  return (color && OPTION_CHIP_CLS[color as OptionColor]) || FALLBACK_CHIP_CLS;
}

export function swatchClass(color: string | undefined): string {
  return (color && OPTION_SWATCH_CLS[color as OptionColor]) || OPTION_SWATCH_CLS.slate;
}
