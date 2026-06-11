import {
  STAGE_OPTIONS,
  HEALTH_OPTIONS,
  AD_PLATFORM_OPTIONS,
  MANUAL_BILLING_OPTIONS,
  SERVICE_OPTIONS,
} from "@/lib/clientProfile";

// ---------------------------------------------------------------------------
// Roster chip presentation — pure label/color maps (palette mirrors the
// RebillStatusChip idiom: bg-{color}-500/10 + text-{color}-600/dark-400).
// ---------------------------------------------------------------------------

export const CHIP_BASE =
  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap";

export const FALLBACK_CHIP_CLS =
  "bg-muted text-muted-foreground";

export const STAGE_CHIP_CLS: Record<string, string> = {
  onboarding: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  launched: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  warmup: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  phase3: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  optimizing: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  scaling: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

export const HEALTH_CHIP_CLS: Record<string, string> = {
  happy: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  mad: "bg-red-500/10 text-red-600 dark:text-red-400",
  money: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  struggling: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  testing: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

export const PLATFORM_CHIP_CLS: Record<string, string> = {
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  concept: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  personal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
};

/** Mirrors RebillStatusChip colors for the same words (pepads manual chips). */
export const MANUAL_BILLING_CHIP_CLS: Record<string, string> = {
  extended: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  upcoming: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  paused: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

export const PEPADS_BADGE_CLS =
  "inline-flex items-center px-1.5 py-0 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30";

/** Fixed roster services (prototype palette: meta=blue, tiktok=pink, google=green, creatives=violet, email=orange). */
export const SERVICE_CHIP_CLS: Record<string, string> = {
  meta: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  tiktok: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  google: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  creatives: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  email: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

function toLabelMap(
  options: ReadonlyArray<{ value: string; label: string }>
): Record<string, string> {
  return Object.fromEntries(options.map((o) => [o.value, o.label]));
}

export const STAGE_LABELS = toLabelMap(STAGE_OPTIONS);
export const HEALTH_LABELS = toLabelMap(HEALTH_OPTIONS);
export const PLATFORM_LABELS = toLabelMap(AD_PLATFORM_OPTIONS);
export const MANUAL_BILLING_LABELS = toLabelMap(MANUAL_BILLING_OPTIONS);
export const SERVICE_LABELS = toLabelMap(SERVICE_OPTIONS);

// Effective money values live in lib/clientProfile.ts (the Revenue Projection
// baseline uses them too) — re-exported here for the UI layer.
export { effectiveMrrCents, effectiveLtvCents } from "@/lib/clientProfile";

/**
 * "$7,000", "7k", "7000.50" → cents; null when unparseable/empty. Commas are
 * accepted ONLY as thousands separators ("7,000" ✓, "1,5k" ✗ — a European
 * decimal comma must not silently parse as 15k). Callers should treat null
 * from a NON-empty input as "invalid, keep the old value" — only an empty
 * input means "clear".
 */
export function parseMoneyToCents(raw: string | null): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/[$\s]/g, "");
  if (!s) return null;
  // Validate comma placement before stripping (thousands groups of 3 only).
  const numericPart = s.endsWith("k") ? s.slice(0, -1) : s;
  if (numericPart.includes(",") && !/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(numericPart)) {
    return null;
  }
  const m = s.replace(/,/g, "").match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!m) return null;
  const dollars = parseFloat(m[1]) * (m[2] ? 1000 : 1);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}
