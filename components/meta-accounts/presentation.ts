import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OptionColor } from "@/lib/metaAccountOptionRules";

// ---------------------------------------------------------------------------
// Meta Accounts chip presentation. Stage / Status options carry an
// ADMIN-CHOSEN palette color, rendered in the kit's subtle badge look (faint
// tinted border + fill and toned text, like `badgeTone` in
// components/ui/badge) with a dot of the same family. Tailwind can't purge
// dynamically-built class strings, so every map is spelled out per color
// token in lib/metaAccountOptionRules.ts (OPTION_COLOR_TOKENS) — keep both in
// lockstep.
// ---------------------------------------------------------------------------

/** Toned border/fill/text per color token (layered over the outline badge). */
export const OPTION_BADGE_CLS: Record<OptionColor, string> = {
  slate:
    "border-slate-500/25 bg-slate-500/[0.08] text-slate-700 dark:border-slate-400/20 dark:bg-slate-400/10 dark:text-slate-300",
  gray: "border-gray-500/25 bg-gray-500/[0.08] text-gray-700 dark:border-gray-400/20 dark:bg-gray-400/10 dark:text-gray-300",
  sky: "border-sky-500/25 bg-sky-500/[0.08] text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300",
  blue: "border-blue-500/25 bg-blue-500/[0.08] text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300",
  indigo:
    "border-indigo-500/25 bg-indigo-500/[0.08] text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/10 dark:text-indigo-300",
  violet:
    "border-violet-500/25 bg-violet-500/[0.08] text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300",
  teal: "border-teal-500/25 bg-teal-500/[0.08] text-teal-700 dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-teal-300",
  emerald:
    "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
  amber:
    "border-amber-500/30 bg-amber-500/[0.08] text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
  orange:
    "border-orange-500/25 bg-orange-500/[0.08] text-orange-700 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-300",
  red: "border-red-500/25 bg-red-500/[0.07] text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300",
  pink: "border-pink-500/25 bg-pink-500/[0.08] text-pink-700 dark:border-pink-400/20 dark:bg-pink-400/10 dark:text-pink-300",
};

/** Hover for option chips that are buttons (static chips never get it). */
export const OPTION_BADGE_HOVER_CLS: Record<OptionColor, string> = {
  slate: "hover:bg-slate-500/15 dark:hover:bg-slate-400/15",
  gray: "hover:bg-gray-500/15 dark:hover:bg-gray-400/15",
  sky: "hover:bg-sky-500/15 dark:hover:bg-sky-400/15",
  blue: "hover:bg-blue-500/15 dark:hover:bg-blue-400/15",
  indigo: "hover:bg-indigo-500/15 dark:hover:bg-indigo-400/15",
  violet: "hover:bg-violet-500/15 dark:hover:bg-violet-400/15",
  teal: "hover:bg-teal-500/15 dark:hover:bg-teal-400/15",
  emerald: "hover:bg-emerald-500/15 dark:hover:bg-emerald-400/15",
  amber: "hover:bg-amber-500/15 dark:hover:bg-amber-400/15",
  orange: "hover:bg-orange-500/15 dark:hover:bg-orange-400/15",
  red: "hover:bg-red-500/[0.12] dark:hover:bg-red-400/15",
  pink: "hover:bg-pink-500/15 dark:hover:bg-pink-400/15",
};

/** Solid swatch — chip dots, filter-pill dots and the color picker. */
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

function isOptionColor(color: string | undefined): color is OptionColor {
  return !!color && Object.prototype.hasOwnProperty.call(OPTION_BADGE_CLS, color);
}

/**
 * Full class string for a stage/status chip. An unknown color — e.g. a row
 * still tagged with an option that was since removed — renders as the plain
 * neutral outline chip. `interactive` adds the hover for chips that are
 * buttons.
 */
export function chipClass(color: string | undefined, interactive = false): string {
  const known = isOptionColor(color);
  return cn(
    badgeVariants({ variant: "outline" }),
    "gap-1.5",
    known && OPTION_BADGE_CLS[color],
    interactive && (known ? OPTION_BADGE_HOVER_CLS[color] : "hover:bg-muted")
  );
}

/** Dot / swatch fill for a color token (neutral when unknown). */
export function swatchClass(color: string | undefined): string {
  return isOptionColor(color) ? OPTION_SWATCH_CLS[color] : "bg-muted-foreground";
}
